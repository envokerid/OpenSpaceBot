// Opt-in real-provider benchmark, confined to a disposable verification server.
// Only a still-valid access token is copied; no live login or refresh token is changed.
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { launchVerificationServer, runControlOmb, verificationServerEnvironment } from "./control-omb.ts";
import { waitForExit } from "../server/testing/cleanup.ts";
const { values } = parseArgs({ options: {
  live: { type: "boolean", default: false }, model: { type: "string", default: "gpt-6-luna" },
  cycles: { type: "string", default: "3" }, "auth-home": { type: "string" },
} });
if (!values.live) throw new Error("Use --live to authorize real model requests.");
const cycles = Number(values.cycles);
if (!Number.isInteger(cycles) || cycles < 1 || cycles > 5) throw new Error("cycles must be 1–5");
const auth = JSON.parse(readFileSync(join(values["auth-home"] ?? join(homedir(), ".codex"), "auth.json"), "utf8"));
const accessToken = auth.tokens?.access_token;
if (typeof accessToken !== "string") throw new Error("No existing ChatGPT access token.");
const claims = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
if (Number(claims.exp) * 1000 < Date.now() + 600_000) throw new Error("Access token must remain valid for at least ten minutes. Refresh through the normal login first.");
const fixture = await launchVerificationServer();
const { dataDir, logPath, url } = fixture.info;
let child: ChildProcess | undefined;
let stopped = false;
const stop = () => { stopped = true; child?.kill("SIGTERM"); };
process.once("SIGINT", stop); process.once("SIGTERM", stop);
const commands: unknown[] = []; const records: any[] = []; const boots: unknown[] = [];
const receipts = join(dataDir, "native-latency-receipts.jsonl");
const preload = join(dataDir, "latency-preload.mjs");
const evidencePath = `${logPath}.native-latency.json`;
const control = async (...args: string[]) => {
  if (stopped) throw new Error("Benchmark stopped");
  const result = await runControlOmb([...args, "--url", url]) as any;
  commands.push({ args, result }); return result;
};
const restart = async () => {
  await waitForExit(child ?? fixture.child, { signal: "SIGTERM" });
  if (stopped) throw new Error("Benchmark stopped");
  const started = Date.now(); const fd = openSync(logPath, "a", 0o600);
  child = spawn(process.execPath, ["--experimental-strip-types", "--import", preload, fileURLToPath(new URL("../server/index.ts", import.meta.url))], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: verificationServerEnvironment({}, dataDir, Number(new URL(url).port)), stdio: ["ignore", fd, fd],
  }); closeSync(fd);
  while (Date.now() - started < 45_000) {
    if (stopped || child.exitCode !== null) throw new Error("Benchmark server exited");
    try { if ((await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) { boots.push({ readyMs: Date.now() - started }); return; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Benchmark server did not become ready");
};
try {
  // The observation shim does not change requests or credentials. It records only
  // timing/configuration/usage metadata, never tokens, instructions or prompt text.
  writeFileSync(preload, `
import { appendFileSync } from 'node:fs';
const original = globalThis.fetch;
const record = value => appendFileSync(${JSON.stringify(receipts)}, JSON.stringify(value) + '\\n', { mode: 0o600 });
globalThis.fetch = async (input, init) => {
  const address = String(input);
  if (address !== 'https://chatgpt.com/backend-api/codex/responses') return original(input, init);
  const body = JSON.parse(init.body); const started = Date.now();
  const id = crypto.randomUUID();
  record({ id, phase: 'request', at: started, model: body.model, reasoning: body.reasoning, serviceTier: body.service_tier, tools: body.tools?.length ?? 0 });
  const response = await original(input, init);
  record({ id, phase: 'headers', at: Date.now(), status: response.status });
  if (!response.ok || !response.body) return response;
  let buffer = ''; const decoder = new TextDecoder();
  return new Response(response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
    buffer += decoder.decode(chunk, { stream: true }); let split;
    while ((split = buffer.indexOf('\\n')) >= 0) {
      const line = buffer.slice(0, split).trim(); buffer = buffer.slice(split + 1);
      if (!line.startsWith('data:')) continue;
      try { const event = JSON.parse(line.slice(5));
        if (event.type === 'response.completed') record({ id, phase: 'completed', at: Date.now(), model: event.response?.model, serviceTier: event.response?.service_tier, reasoning: event.response?.reasoning, usage: { input: event.response?.usage?.input_tokens, output: event.response?.usage?.output_tokens, cachedInput: event.response?.usage?.input_tokens_details?.cached_tokens, reasoning: event.response?.usage?.output_tokens_details?.reasoning_tokens } });
        if (event.type === 'error' || event.type === 'response.failed') record({ id, phase: 'failed', at: Date.now(), code: event.code || event.response?.error?.code });
      } catch {}
    }
    if (buffer.length > 2000000) buffer = '';
    controller.enqueue(chunk);
  } })), { status: response.status, headers: response.headers });
};
`, { mode: 0o600 });
  // Stop before editing this fixture's configuration.
  await waitForExit(fixture.child, { signal: "SIGTERM" });
  const path = join(dataDir, "config.json"); const config = JSON.parse(readFileSync(path, "utf8"));
  config.instances.native = { driver: "nativeAgent", config: { models: { "openai-codex": [values.model] }, chatgpt: { effort: "high", fastMode: true } } };
  writeFileSync(path, JSON.stringify(config), { mode: 0o600 });
  const accounts = join(dataDir, "provider-accounts"); mkdirSync(accounts, { mode: 0o700 });
  writeFileSync(join(accounts, `${createHash("sha256").update("native").digest("hex")}.json`), JSON.stringify({ version: 1, accounts: { "openai-codex": { accessToken, expiresAt: Number(claims.exp) * 1000 } } }), { mode: 0o600 });
  for (let cycle = 0; cycle < cycles; cycle++) {
    await restart();
    await control("doctor");
    const { bot } = await control("new-bot", "--name", `Native latency ${cycle + 1}`);
    for (const name of ["Engineer", "Researcher", "Writer", "Reviewer"]) if (cycle === 0) await control("new-bot", "--name", name);
    const patch = await fetch(`${url}/api/bots/${bot.id}`, { method: "PATCH", headers: { "content-type": "application/json", origin: url }, body: JSON.stringify({ chiefOfStaff: true }) });
    if (!patch.ok) throw new Error("Fixture Chief setup failed");
    await control("set-model", "--bot", bot.id, "--instance", "native", "--model", `openai-codex:${values.model}`);
    const prompts = ["Hey!", "How are you?", "What can you help me with? Keep it to one sentence."];
    for (let index = 0; index < prompts.length; index++) {
      const submittedAt = Date.now();
      await control("send", "--bot", bot.id, "--task", bot.activeTaskId, "--text", prompts[index]);
      const settled = await control("wait", "--bot", bot.id, "--task", bot.activeTaskId, "--timeout", "90");
      if (settled.status !== "settled") throw new Error(`Native benchmark did not settle: ${settled.status}`);
      const events = readFileSync(join(dataDir, "events", `${bot.activeTaskId}.ndjson`), "utf8").trim().split("\n").map(line => JSON.parse(line));
      const start = events.findLast(event => event.type === "turn.started");
      const turn = events.filter(event => event.turnId === start?.turnId);
      const end = turn.find(event => event.type === "turn.completed");
      if (!end?.ok) throw new Error("Native benchmark turn failed");
      const first = turn.find(event => event.type === "content.delta" && event.streamKind === "assistant_text");
      const ms = (event: any) => event ? Date.parse(event.createdAt) - submittedAt : null;
      const received = readFileSync(receipts, "utf8").trim().split("\n").map(line => JSON.parse(line));
      const request = received.findLast(row => row.phase === "request" && row.at >= submittedAt);
      const response = received.find(row => row.phase === "completed" && row.id === request?.id);
      if (request?.model !== values.model || request?.reasoning?.effort !== "high" || request?.serviceTier !== "priority" || response?.reasoning?.effort !== "high") throw new Error("Benchmark model/reasoning configuration was not confirmed");
      const record = { returnedServiceTier: response.serviceTier ?? null, fastConfirmed: response.serviceTier === "priority", cycle: cycle + 1, sample: index + 1, cold: index === 0, model: values.model, effort: "high", requestedServiceTier: "priority", submittedAt,
        setupMs: ms(start), firstTextMs: ms(first), completedMs: ms(end), usage: end.usage };
      records.push(record); console.info(JSON.stringify(record));
    }
    await control("messages", "--bot", bot.id, "--task", bot.activeTaskId, "--limit", "20");
  }
} finally {
  const provider = existsSync(receipts) ? readFileSync(receipts, "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
  const preparation = readFileSync(logPath, "utf8").split("\n").filter(line => line.startsWith("[turn-latency] ")).map(line => JSON.parse(line.slice(15)));
  try { if (child) await waitForExit(child, { signal: "SIGTERM" }); } finally { await fixture.close(); }
  writeFileSync(evidencePath, JSON.stringify({ fixture: fixture.info, records, boots, provider, preparation, commands,
    scope: "Real ChatGPT endpoint, native driver, high effort/priority requested, isolated Chief chats and team MCP; cold is first send after server restart, server-ready time excluded. No personal transcripts/tools or refresh token copied." }, null, 2), { mode: 0o600 });
  process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  console.info(JSON.stringify({ evidencePath, fixtureRemoved: !existsSync(dataDir) }));
}

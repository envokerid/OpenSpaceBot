// Explicit opt-in live benchmark. All chats, native sessions, and writable
// provider state belong to the disposable verification fixture.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { launchVerificationServer, runControlOmb } from "./control-omb.ts";

const { values } = parseArgs({ options: {
  live: { type: "boolean", default: false },
  codex: { type: "string" },
  model: { type: "string", default: "gpt-6-luna" },
  effort: { type: "string", default: "high" },
  samples: { type: "string", default: "6" },
  chief: { type: "boolean", default: false },
  "no-native-apps": { type: "boolean", default: false },
  metrics: { type: "boolean", default: false },
  "restart-between-turns": { type: "boolean", default: false },
  "auth-home": { type: "string" },
} });
if (!values.live || !values.codex) throw new Error("Use --live --codex /absolute/path/to/codex to authorize real model requests.");
const samples = Number(values.samples);
if (!Number.isInteger(samples) || samples < 2 || samples > 20) throw new Error("--samples must be 2–20");
const binary = resolve(values.codex);
const authSource = join(values["auth-home"] ?? join(homedir(), ".codex"), "auth.json");
if (!existsSync(authSource)) throw new Error("No file-based Codex login found in the selected auth home.");
const abort = new AbortController();
let closeFixture: (() => Promise<void>) | undefined;
const stop = () => { abort.abort(); void closeFixture?.(); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const fixture = await launchVerificationServer(process.env, abort.signal, undefined, undefined, undefined, undefined, ["codex"]);
let closing: Promise<void> | undefined;
closeFixture = () => closing ??= fixture.close();
const records: Array<Record<string, unknown>> = [];
const commands: unknown[] = [];
const cli = async (...args: string[]) => {
  const result = await runControlOmb([...args, "--url", fixture.info.url]) as any;
  commands.push({ args, result });
  return result;
};
const evidencePath = fixture.info.logPath + ".latency.json";
let runtimeVersion: string | undefined;
const nativeMetrics: unknown[] = [];
let metricsRequests = 0;
const metricNames = new Set<string>();
const collector = createServer(async (request, response) => {
  metricsRequests++;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) throw new Error("metrics request too large");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const payload = JSON.parse((request.headers["content-encoding"] === "gzip" ? gunzipSync(bytes) : bytes).toString());
    for (const resource of payload.resourceMetrics ?? []) for (const scope of resource.scopeMetrics ?? []) {
      for (const metric of scope.metrics ?? []) {
        if (typeof metric.name === "string" && /^[a-zA-Z0-9_.-]{1,150}$/.test(metric.name)) metricNames.add(metric.name);
        if (!/^codex\.(api_request|websocket|transport\.|responses_api_|startup[._]|remote_models|cloud_requirements|mcp\.|apps\.|plugins\.|turn\.)/.test(metric.name)) continue;
        // No resource identity, tool arguments or account attributes. Keep
        // only bounded outcome labels needed to interpret startup timings.
        const data = metric.histogram ?? metric.sum ?? metric.gauge;
        nativeMetrics.push({ receivedAt: Date.now(), name: metric.name, unit: metric.unit,
          points: (data?.dataPoints ?? []).map((point: any) => ({
            status: point.attributes?.find((attribute: any) => attribute.key === "status" &&
              /^[a-z_-]{1,60}$/.test(attribute.value?.stringValue ?? ""))?.value.stringValue,
            phase: point.attributes?.find((attribute: any) => attribute.key === "phase" &&
              /^[a-z_.-]{1,80}$/.test(attribute.value?.stringValue ?? ""))?.value.stringValue,
            count: point.count, sum: point.sum, min: point.min, max: point.max,
            asInt: point.asInt, asDouble: point.asDouble,
          })) });
      }
    }
    response.writeHead(200, { "content-type": "application/json" }).end("{}");
  } catch { response.writeHead(400).end(); }
});
try {
  const nativeHome = join(fixture.info.dataDir, "benchmark-codex");
  mkdirSync(nativeHome, { mode: 0o700 });
  const auth = join(nativeHome, "auth.json");
  copyFileSync(authSource, auth);
  chmodSync(auth, 0o600);
  runtimeVersion = execFileSync(binary, ["--version"], { encoding: "utf8", timeout: 10_000,
    cwd: nativeHome, env: { ...process.env, CODEX_HOME: nativeHome } }).trim().slice(0, 160);
  if (values.metrics) {
    await new Promise<void>(resolve => collector.listen(0, "127.0.0.1", resolve));
    const address = collector.address();
    if (!address || typeof address === "string") throw new Error("No metrics collector port");
    writeFileSync(join(nativeHome, "config.toml"), `[analytics]\nenabled = true\n[features]\nruntime_metrics = true\n[otel]\nlog_user_prompt = false\nexporter = "none"\nmetrics_exporter = { otlp-http = { endpoint = "http://127.0.0.1:${address.port}/v1/metrics", protocol = "json" } }\n`, { mode: 0o600 });
  }
  // No personal MCP servers, hooks, skills, or conversation histories are
  // copied. The fixture still mounts OpenMausBot's real team-tools proxy.
  const wrapper = join(fixture.info.dataDir, "live-codex.mjs");
  writeFileSync(wrapper, [
    "#!/usr/bin/env node",
    'import { spawn } from "node:child_process";',
    'import { appendFileSync } from "node:fs";',
    `const args = process.argv.slice(2);`,
    `const child = spawn(${JSON.stringify(binary)}, args, { stdio: ["inherit", "inherit", "pipe"], env: { ...process.env, CODEX_HOME: ${JSON.stringify(nativeHome)}, ${values.metrics ? 'OTEL_METRIC_EXPORT_INTERVAL: "500"' : ""} } });`,
    `child.stderr.on("data", chunk => { process.stderr.write(chunk); appendFileSync(${JSON.stringify(join(fixture.info.dataDir, "native-stderr.log"))}, chunk, { mode: 0o600 }); });`,
    'for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));',
    'child.on("error", () => { process.exitCode = 1; });',
    'child.on("exit", (code) => { process.exitCode = code ?? 1; });',
  ].join("\n"), { mode: 0o700 });
  const patched = await fetch(fixture.info.url + "/api/instances/codex", {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ cli: wrapper, ...(values["no-native-apps"] ? { nativeApps: false } : {}) }),
  });
  if (!patched.ok) throw new Error(`Fixture engine setup failed (${patched.status})`);
  await cli("doctor");
  const { bot } = await cli("new-bot", "--name", "Latency benchmark");
  const threadId = bot.activeTaskId;
  if (values.chief) {
    for (const name of ["Engineer", "Researcher", "Writer", "Reviewer"]) await cli("new-bot", "--name", name);
    const response = await fetch(fixture.info.url + `/api/bots/${bot.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ chiefOfStaff: true }),
    });
    if (!response.ok) throw new Error(`Fixture Chief setup failed (${response.status})`);
    commands.push({ method: "PATCH", botId: bot.id, chiefOfStaff: true, status: response.status });
  }
  await cli("set-model", "--bot", bot.id, "--instance", "codex", "--model", values.model!, "--effort", values.effort!);
  const prompts = ["Hey!", "How are you?", "What can you help me with? Keep it to one sentence.",
    "Thanks!", "What is 2 plus 3?", "Say hello in German."];
  for (let index = 0; index < samples; index++) {
    abort.signal.throwIfAborted();
    if (index > 0 && values["restart-between-turns"]) {
      // Replace only this fixture's idle engine. Its native home and saved
      // cursor survive, as they do when the real application is restarted.
      const response = await fetch(fixture.info.url + "/api/instances/codex", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cli: wrapper }),
      });
      if (!response.ok) throw new Error(`Fixture engine restart failed (${response.status})`);
      commands.push({ method: "PATCH", instanceId: "codex", restartBeforeSample: index + 1, status: response.status });
    }
    const submittedAt = Date.now();
    await cli("send", "--bot", bot.id, "--text", prompts[index % prompts.length]);
    const settled = await cli("wait", "--bot", bot.id, "--timeout", "90");
    if (settled.status !== "settled") throw new Error(`Benchmark did not settle: ${settled.status}`);
    const events = readFileSync(join(fixture.info.dataDir, "events", `${threadId}.ndjson`), "utf8")
      .trim().split("\n").map(line => JSON.parse(line));
    const start = events.findLast(event => event.type === "turn.started");
    const turn = events.filter(event => event.turnId === start?.turnId);
    const end = turn.find(event => event.type === "turn.completed");
    const session = turn.find(event => event.type === "session.started");
    const first = turn.find(event => event.type === "content.delta" && event.streamKind === "assistant_text");
    if (!end?.ok) throw new Error("Live benchmark turn failed; inspect the isolated fixture log.");
    const ms = (event: any) => event ? Date.parse(event.createdAt) - submittedAt : null;
    const record = { sample: index + 1, cold: index === 0 || values["restart-between-turns"],
      startKind: index === 0 ? "fresh-home-and-chat" : values["restart-between-turns"] ? "restarted-runtime" : "retained-runtime",
      chief: values.chief, nativeApps: !values["no-native-apps"], model: values.model, effort: values.effort,
      setupMs: ms(start), sessionReadyMs: ms(session), firstTextMs: ms(first), completedMs: ms(end), usage: end.usage };
    records.push(record);
    console.info(JSON.stringify(record));
  }
  await cli("messages", "--bot", bot.id, "--limit", "20");
  const native = readFileSync(join(fixture.info.dataDir, "native", `${threadId}.ndjson`), "utf8")
    .trim().split("\n").map(line => JSON.parse(line));
  const calls = native.filter(row => row.dir === "out").map(row => row.msg.method);
  const pending = new Map<number, { method: string; at: number }>();
  const rpcTimings: Array<{ method: string; elapsedMs: number }> = [];
  for (const row of native) {
    if (row.dir === "out" && row.msg.id !== undefined && row.msg.method) {
      pending.set(row.msg.id, { method: row.msg.method, at: Date.parse(row.at) });
    } else if (row.dir === "in" && pending.has(row.msg.id)) {
      const sent = pending.get(row.msg.id)!;
      rpcTimings.push({ method: sent.method, elapsedMs: Date.parse(row.at) - sent.at });
      pending.delete(row.msg.id);
    }
  }
  const firstNativeAt = Date.parse(native[0].at);
  const mcpStartup = native.filter(row => row.msg.method === "mcpServer/startupStatus/updated")
    .map(row => ({ elapsedMs: Date.parse(row.at) - firstNativeAt,
      name: row.msg.params?.name, status: row.msg.params?.status }));
  records.push({ rpcTimings, mcpStartup });
  const protocol = { initializes: calls.filter(method => method === "initialize").length,
    starts: calls.filter(method => method === "thread/start").length,
    resumes: calls.filter(method => method === "thread/resume").length,
    instructionUpdates: calls.filter(method => method === "thread/inject_items").length };
  records.push({ protocol });
  if (values["restart-between-turns"] &&
      (protocol.initializes !== samples || protocol.starts !== 1 || protocol.resumes !== samples - 1))
    throw new Error("Restart benchmark did not preserve one native conversation across the expected runtime restarts");
} finally {
  const stderrPath = join(fixture.info.dataDir, "native-stderr.log");
  const stderr = existsSync(stderrPath) ? readFileSync(stderrPath, "utf8") : "";
  // Only aggregate diagnostics leave the fixture; stderr may contain URLs
  // or account data. Preserve no raw provider payloads or credentials.
  const transport = { websocket426: (stderr.match(/426/g) ?? []).length,
    httpFallback: (stderr.match(/fall(?:ing)?\s*back[^\n]*http|fallback_to_http/gi) ?? []).length,
    websocketMentions: (stderr.match(/websocket/gi) ?? []).length };
  const preparation = readFileSync(fixture.info.logPath, "utf8").split("\n")
    .filter(line => line.startsWith("[turn-latency] ")).map(line => JSON.parse(line.slice("[turn-latency] ".length)));
  // Native exporters flush at shutdown; keep the loopback collector alive.
  await closeFixture();
  if (collector.listening) await new Promise<void>(resolve => collector.close(() => resolve()));
  writeFileSync(evidencePath, JSON.stringify({ fixture: fixture.info, runtime: { binary, version: runtimeVersion }, records, commands,
    preparation, transport, nativeMetrics, metricsRequests, metricNames: [...metricNames],
    scope: "Fresh isolated chat, real model, OpenMausBot team tools; no user transcript or computer attached." }, null, 2), { mode: 0o600 });
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  console.info(JSON.stringify({ evidencePath, fixtureRemoved: !existsSync(fixture.info.dataDir) }));
}

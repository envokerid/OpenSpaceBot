import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb, verificationServerEnvironment } from "../scripts/control-omb.ts";
import { waitForExit } from "./testing/cleanup.ts";

it("runs native multi-provider login and approved tool turns through an isolated OpenMausBot server", async () => {
  const fixture = await launchVerificationServer();
  const { url, dataDir, logPath } = fixture.info;
  let child: ChildProcess | undefined;
  const evidence: unknown[] = [{ fixture: fixture.info }];
  const preload = join(dataDir, "native-provider-preload.mjs");
  const approval = join(dataDir, "approve-device");
  const receipts = join(dataDir, "native-receipts.jsonl");
  writeFileSync(preload, `
import { existsSync, appendFileSync } from "node:fs";
import { nativeProviderFixture } from ${JSON.stringify(new URL("./testing/native-provider-fixture.ts", import.meta.url).href)};
import { NATIVE_PROVIDERS } from ${JSON.stringify(new URL("../shared/native-providers.ts", import.meta.url).href)};
const upstream = nativeProviderFixture();
const origins = new Set(NATIVE_PROVIDERS.flatMap(p => [new URL(p.baseUrl).origin, p.authOrigin]).filter(Boolean));
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const address = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!origins.has(address.origin)) {
    if (["127.0.0.1", "localhost", "[::1]"].includes(address.hostname)) return original(input, init);
    throw new Error("External network disabled in native fixture");
  }
  upstream.state.approved = existsSync(${JSON.stringify(approval)}); upstream.state.tool = true;
  const response = await upstream.fetch(address.href, init);
  const call = upstream.calls.at(-1);
  if (/responses|messages|completions/.test(address.pathname)) appendFileSync(${JSON.stringify(receipts)}, JSON.stringify({ path: address.pathname, model: call.body.model, tools: call.body.tools?.map(t => t.name || t.function?.name), instructions: call.body.instructions || call.body.system || call.body.messages?.find(m => m.role === "system")?.content }) + "\\n");
  return response;
};
`);
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${url}${path}`, { method, headers: { "content-type": "application/json", origin: url }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
    const result = await response.json() as any;
    expect(response.ok, JSON.stringify(result)).toBe(true); evidence.push({ method, path, result }); return result;
  };
  const control = async (args: string[]) => { const result = await runControlOmb([...args, "--url", url]) as any; evidence.push({ command: args, result }); return result; };
  const restart = async () => {
    await waitForExit(child ?? fixture.child, { signal: "SIGTERM" });
    const log = openSync(logPath, "a", 0o600);
    child = spawn(process.execPath, ["--experimental-strip-types", "--import", preload, fileURLToPath(new URL("./index.ts", import.meta.url))], {
      cwd: fileURLToPath(new URL("..", import.meta.url)), env: verificationServerEnvironment({}, dataDir, Number(new URL(url).port)), stdio: ["ignore", log, log],
    }); closeSync(log);
    await expect.poll(async () => { try { return (await fetch(`${url}/api/health`)).ok; } catch { return false; } }, { timeout: 20_000 }).toBe(true);
  };
  try {
    await restart(); await control(["doctor"]);
    const initial = (await api("GET", "/api/instances")).instances.find((row: any) => row.instanceId === "native");
    expect(initial.driverKind).toBe("nativeAgent"); expect(initial.snapshot.authenticated).toBe(false); expect(initial.cli).toBeUndefined();
    const cancelled = (await api("POST", "/api/instances/native/auth/start", { provider: "openai-codex" })).auth;
    await api("POST", "/api/instances/native/auth/cancel", { flowId: cancelled.flowId });
    writeFileSync(approval, "synthetic approval");
    for (const provider of ["openai-codex", "openrouter", "anthropic"]) {
      const auth = (await api("POST", "/api/instances/native/auth/start", { provider })).auth;
      if (provider === "openai-codex") await expect.poll(async () => (await api("GET", `/api/instances/native/auth/status?flowId=${auth.flowId}`)).auth.phase, { timeout: 5000 }).toBe("succeeded");
      else await api("POST", "/api/instances/native/auth/complete", { flowId: auth.flowId, code: "fixture-secret" });
      const connected = (await api("POST", "/api/instances/native/refresh-models")).instances.find((row: any) => row.instanceId === "native");
      expect(connected.models.options).toContainEqual(expect.objectContaining({ id: `${provider}:fixture-model` }));
      const artifact = join(dataDir, `${provider}-artifact`);
      const name = `nativefixture-${provider}`;
      await api("POST", "/api/mcp/servers", { name, command: process.execPath, args: [fileURLToPath(new URL("./testing/native-tool-fixture.mjs", import.meta.url))], env: { NATIVE_FIXTURE_ARTIFACT: artifact }, enabled: true });
      await api("PATCH", `/api/mcp/servers/${name}`, { enabled: true });
      const { bot } = await control(["new-bot", "--name", `Native ${provider}`]);
      await control(["set-model", "--bot", bot.id, "--instance", "native", "--model", `${provider}:fixture-model`]);
      await api("PATCH", `/api/bots/${bot.id}`, { mcpServers: [name], approvalMode: "ask", soul: "Native fixture instruction: only claim writes after the tool succeeds." });
      await control(["send", "--bot", bot.id, "--task", bot.activeTaskId, "--text", "Write the fixture artifact using the tool."]);
      expect((await control(["wait", "--bot", bot.id, "--task", bot.activeTaskId, "--timeout", "20"])).status).toBe("needs-user");
      expect(existsSync(artifact)).toBe(false);
      const current = (await api("GET", "/api/bots")).bots.find((row: any) => row.id === bot.id);
      const card = current.messages.find((message: any) => message.card?.requestId && !message.card.answered)?.card;
      expect(card?.requestId).toBeTruthy();
      await api("POST", `/api/bots/${bot.id}/respond`, { threadId: bot.activeTaskId, requestId: card.requestId, behavior: "allow" });
      expect((await control(["wait", "--bot", bot.id, "--task", bot.activeTaskId, "--timeout", "20"])).status).toBe("settled");
      expect(readFileSync(artifact, "utf8")).toBe("native-tool-proof");
      const transcript = await control(["messages", "--bot", bot.id, "--task", bot.activeTaskId, "--limit", "20"]);
      expect(transcript.messages).toContainEqual(expect.objectContaining({ role: "bot", text: "Native tool completed." }));
    }
    await restart();
    const restored = (await api("GET", "/api/instances")).instances.find((row: any) => row.instanceId === "native");
    expect(restored.nativeAccounts.filter((account: any) => account.connected)).toHaveLength(3);
    const removed = (await api("POST", "/api/instances/native/auth/sign-out", { provider: "anthropic" })).instances.find((row: any) => row.instanceId === "native");
    expect(removed.nativeAccounts.find((row: any) => row.provider === "anthropic").connected).toBe(false);
    expect(removed.nativeAccounts.find((row: any) => row.provider === "openai-codex").connected).toBe(true);
    expect(removed.models.options.some((row: any) => row.provider === "anthropic")).toBe(false);
    const nativeRequests = readFileSync(receipts, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(nativeRequests.some(row => JSON.stringify(row.instructions).includes("Native fixture instruction"))).toBe(true);
    evidence.push({ receipts: nativeRequests });
  } finally {
    if (existsSync(receipts)) evidence.push({ receipts: readFileSync(receipts, "utf8") });
    const file = `${logPath}.native-agent.json`; writeFileSync(file, JSON.stringify(evidence, null, 2)); console.log(`Native agent evidence: ${file}`);
    if (child) await waitForExit(child, { signal: "SIGTERM" }); await fixture.close();
  }
}, 90_000);

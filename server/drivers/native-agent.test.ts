import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createNativeDriver } from "./native-agent.ts";
import { nativeProviderFixture, FIXTURE_KEY } from "../testing/native-provider-fixture.ts";
import { recordEvents } from "../testing/events.ts";
import { removeTempDir } from "../testing/cleanup.ts";
import { ensureDirs } from "../config.ts";
import type { ProviderInstance } from "../contracts.ts";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
async function fixture(provider: string, config?: unknown) {
  ensureDirs(); const home = mkdtempSync(join(tmpdir(), "omb-native-driver-"));
  const wire = nativeProviderFixture(); const driver = createNativeDriver(wire.fetch, 1);
  const instance = await driver.create({ instanceId: "native-test", enabled: true, displayName: "Native test", config: config === undefined ? driver.defaultConfig() : driver.decodeConfig(config), environment: { OMB_DATA_DIR: home } });
  cleanup.push(async () => { await instance.dispose(); await removeTempDir(home); });
  await connect(instance, provider);
  const artifact = join(home, "artifact.txt");
  return { wire, instance, artifact, integrations: { custom: { fixture: { command: process.execPath, args: [fileURLToPath(new URL("../testing/native-tool-fixture.mjs", import.meta.url))], env: { NATIVE_FIXTURE_ARTIFACT: artifact } } } } };
}
async function connect(instance: ProviderInstance, provider: string) {
  const auth = await instance.startAuthentication!(provider);
  if (provider === "openai-codex" || provider === "xai-oauth" || provider === "nous") await expect.poll(async () => (await instance.getAuthentication!(auth.flowId!)).phase).toBe("succeeded");
  else await instance.completeAuthentication!(auth.flowId!, FIXTURE_KEY);
  await instance.refreshModels!();
}
it.each(["openai-codex", "xai-oauth", "nous", "openai-api", "anthropic"])("runs %s directly and executes tools only after harness approval", async provider => {
  const { wire, instance, artifact, integrations } = await fixture(provider); wire.state.tool = true;
  const recorder = recordEvents(instance.adapter);
  expect(instance.models.options.some(row => row.id === `${provider}:fixture-model`)).toBe(true);
  await instance.adapter.sendTurn({ threadId: `native-${provider}`, text: "write the artifact", model: `${provider}:fixture-model`, integrations, approvalMode: "ask" });
  const permission = await recorder.until(event => event.type === "request.opened");
  if (permission.type !== "request.opened") throw new Error("Missing permission");
  expect(existsSync(artifact)).toBe(false);
  await expect(instance.signOut!(provider)).rejects.toThrow("Finish or stop");
  await instance.adapter.respondToRequest(`native-${provider}`, permission.requestId!, { behavior: "allow" });
  expect(await recorder.until(event => event.type === "turn.completed")).toMatchObject({ ok: true });
  expect(readFileSync(artifact, "utf8")).toBe("native-tool-proof");
  expect(recorder.events).toContainEqual(expect.objectContaining({ type: "item.completed", text: "Native tool completed." }));
  expect(JSON.stringify(recorder.events)).not.toContain(FIXTURE_KEY);
  await instance.signOut!(provider);
  expect(instance.models.options.some(row => row.provider === provider)).toBe(false);
});
it.each(["openai-codex", "anthropic"])("rejects truncated %s streams before any tool executes", async provider => {
  const { wire, instance, artifact, integrations } = await fixture(provider); wire.state.tool = true; wire.state.truncated = true;
  const recorder = recordEvents(instance.adapter);
  await instance.adapter.sendTurn({ threadId: `truncated-${provider}`, text: "write", model: `${provider}:fixture-model`, integrations, approvalMode: "full" });
  expect(await recorder.until(event => event.type === "turn.completed")).toMatchObject({ ok: false });
  expect(existsSync(artifact)).toBe(false);
});
it("denies and cancels tool requests without executing the operation", async () => {
  const { wire, instance, artifact, integrations } = await fixture("openai-codex"); wire.state.tool = true;
  for (const behavior of ["deny", "cancel"] as const) {
    const recorder = recordEvents(instance.adapter); const threadId = `native-${behavior}`;
    await instance.adapter.sendTurn({ threadId, text: "write", model: "openai-codex:fixture-model", integrations, approvalMode: "ask" });
    const permission = await recorder.until(event => event.type === "request.opened");
    if (permission.type !== "request.opened") throw new Error("Missing permission");
    if (behavior === "deny") await instance.adapter.respondToRequest(threadId, permission.requestId!, { behavior });
    else await instance.adapter.interruptTurn(threadId);
    expect(await recorder.until(event => event.type === "turn.completed")).toMatchObject({ ok: false });
    expect(existsSync(artifact)).toBe(false); recorder.stop();
  }
});
it.each(["openai-codex", "anthropic", "openai-api"])("runs the tool-free %s helper using the same native transport", async provider => {
  const { instance } = await fixture(provider);
  expect(await instance.generateText!("Summarize")).toBe("Native fixture reply.");
});

it("forwards explicit ChatGPT high effort and fast service without affecting other providers", async () => {
  const { instance, wire } = await fixture("openai-codex", { chatgpt: { effort: "high", fastMode: true } });
  expect(await instance.generateText!("Hello")).toBe("Native fixture reply.");
  expect(wire.calls.find(call => call.url.endsWith("/responses"))?.body).toMatchObject({ reasoning: { effort: "high" }, service_tier: "priority" });
  const other = await fixture("xai-oauth", { chatgpt: { effort: "high", fastMode: true } });
  await other.instance.generateText!("Hello");
  const request = other.wire.calls.find(call => call.url.endsWith("/responses"))!.body;
  expect(request).not.toHaveProperty("service_tier");
  expect(request).not.toHaveProperty("reasoning");
});

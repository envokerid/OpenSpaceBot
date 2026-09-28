import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { removeTempDir } from "../../testing/cleanup.ts";
import { nativeProviderFixture, FIXTURE_KEY } from "../../testing/native-provider-fixture.ts";
import { NativeAccounts } from "./accounts.ts";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "omb-native-auth-"));
  const file = join(home, "accounts.json"); const provider = nativeProviderFixture();
  const accounts = new NativeAccounts({ file, fetch: provider.fetch, pollIntervalMs: 1 });
  cleanups.push(async () => { await accounts.dispose(); await removeTempDir(home); });
  return { ...provider, file, accounts };
}
it.each(["openai-codex", "xai-oauth", "nous"])("owns the %s device flow and stores only confirmed tokens", async provider => {
  const { accounts, file, state, calls } = fixture(); state.approved = false;
  const auth = await accounts.start(provider);
  expect(auth).toMatchObject({ phase: "waiting", userCode: expect.any(String) });
  expect(accounts.connected(provider)).toBe(false);
  expect(JSON.stringify(await accounts.get(auth.flowId!))).not.toContain("private-device");
  state.approved = true;
  await expect.poll(async () => (await accounts.get(auth.flowId!)).phase).toBe("succeeded");
  expect(accounts.connected(provider)).toBe(true);
  expect(await accounts.get(auth.flowId!)).toMatchObject({ authorizationUrl: null, expiresAt: null });
  if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
  if (provider === "openai-codex") expect(calls.some(call => call.body.code_verifier === "fixture-verifier")).toBe(true);
  await accounts.signOut(provider); expect(accounts.connected(provider)).toBe(false);
});
it("uses PKCE for OpenRouter without an on-server browser or callback listener", async () => {
  const { accounts, calls } = fixture(); const auth = await accounts.start("openrouter");
  const link = new URL(auth.authorizationUrl!);
  expect(link.searchParams.has("callback_url")).toBe(false);
  await accounts.complete(auth.flowId!, "provider-code");
  const exchange = calls.find(call => call.url.endsWith("auth/keys"))!;
  expect(createHash("sha256").update(exchange.body.code_verifier).digest("base64url")).toBe(link.searchParams.get("code_challenge"));
  expect((await accounts.credential("openrouter")).accessToken).toBe(FIXTURE_KEY);
});
it("keeps provider accounts separate and never exposes API keys in status", async () => {
  const { accounts } = fixture();
  for (const provider of ["openai-api", "anthropic"]) {
    const auth = await accounts.start(provider);
    await expect(accounts.complete(auth.flowId!, "invalid")).rejects.toThrow("401");
    expect(accounts.connected(provider)).toBe(false);
    await accounts.complete(auth.flowId!, FIXTURE_KEY);
    expect(JSON.stringify(accounts.describe())).not.toContain(FIXTURE_KEY);
  }
  await accounts.signOut("anthropic"); expect(accounts.connected("openai-api")).toBe(true);
});
it("cancellation cannot save tokens from a late device approval", async () => {
  const { accounts, state } = fixture(); state.approved = false;
  const auth = await accounts.start(); await accounts.cancel(); state.approved = true;
  expect(await accounts.get(auth.flowId!)).toMatchObject({ phase: "cancelled" });
  expect(accounts.connected("openai-codex")).toBe(false);
});
it("serializes token refresh and persists the rotated credential", async () => {
  const { accounts, file, state } = fixture();
  const auth = await accounts.start(); await expect.poll(async () => (await accounts.get(auth.flowId!)).phase).toBe("succeeded");
  const saved = JSON.parse(readFileSync(file, "utf8")); saved.accounts["openai-codex"].expiresAt = 1; writeFileSync(file, JSON.stringify(saved));
  await Promise.all([accounts.credential("openai-codex"), accounts.credential("openai-codex")]);
  expect(state.refreshCount).toBe(1);
  expect(JSON.parse(readFileSync(file, "utf8")).accounts["openai-codex"].expiresAt).toBeGreaterThan(Date.now());
});
it("fails closed on a corrupt account file without overwriting it", async () => {
  const { accounts, file } = fixture(); writeFileSync(file, "broken");
  await expect(accounts.start()).rejects.toThrow("could not be read"); expect(readFileSync(file, "utf8")).toBe("broken");
});
it("rejects an untrusted OAuth discovery endpoint before releasing credentials", async () => {
  const { file } = fixture();
  const accounts = new NativeAccounts({ file, fetch: async () => Response.json({ token_endpoint: "https://evil.example/token" }) });
  try { await expect(accounts.start("xai-oauth")).rejects.toThrow("untrusted"); } finally { await accounts.dispose(); }
});
it("rejects a saved inference URL outside the provider allowlist", async () => {
  const { accounts, file } = fixture();
  writeFileSync(file, JSON.stringify({ version: 1, accounts: { nous: { accessToken: "private", baseUrl: "https://evil.example/v1" } } }));
  await expect(accounts.credential("nous")).rejects.toThrow("could not be read");
});
it("does not resurrect an account when refresh completes after disconnect", async () => {
  const { file } = fixture();
  writeFileSync(file, JSON.stringify({ version: 1, accounts: { "openai-codex": { accessToken: "expired", refreshToken: "refresh", expiresAt: 1 } } }));
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const accounts = new NativeAccounts({ file, fetch: async () => { entered(); await gate; return Response.json({ access_token: "rotated", expires_in: 3600 }); } });
  try {
    const refresh = accounts.credential("openai-codex");
    const rejected = expect(refresh).rejects.toThrow("account changed");
    await started;
    const disconnect = accounts.signOut("openai-codex");
    release(); await rejected; await disconnect;
    expect(accounts.connected("openai-codex")).toBe(false);
  } finally { release(); await accounts.dispose(); }
});

import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ directory: '', request: vi.fn(), completeOAuth: vi.fn(), stop: vi.fn() }));
vi.mock('./config.ts', () => ({ get DATA_DIR() { return mocks.directory; } }));
vi.mock('./openclaw-gateway.ts', () => ({
  startConnectorGateway: vi.fn(async () => ({ request: mocks.request, completeOAuth: mocks.completeOAuth, stop: mocks.stop })),
  OPENCLAW_VERSION: "2026.9.6",
}));
let connectors: typeof import('./connectors.ts');
const tool = { name: 'connected_account__echo', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } };
beforeEach(async () => {
  vi.resetModules(); mocks.directory = mkdtempSync(join(tmpdir(), 'omb-connectors-unit-'));
  mocks.request.mockReset().mockImplementation(async (method: string) => {
    if (method === 'config.get') return { hash: 'fixture' };
    if (method === 'omb.connectors.tools') return { tools: [tool] };
    if (method === 'omb.connectors.call') return { result: { echoed: true } };
    return {};
  });
  mocks.completeOAuth.mockReset().mockResolvedValue(undefined); mocks.stop.mockReset().mockResolvedValue(undefined);
  connectors = await import('./connectors.ts');
});
afterEach(async () => { await connectors.stopConnectors(); vi.useRealTimers(); rmSync(mocks.directory, { recursive: true, force: true }); });
const add = (auth: 'none' | 'token' | 'oauth' = 'none') => connectors.addProvider({ slug: 'fixture', label: 'Fixture', url: 'https://provider.invalid/mcp', auth });
const done = async (id: string) => {
  await expect.poll(async () => (await connectors.authStatus(id)).kind).toBe('connected');
};
async function call(name: string, args: unknown, accounts: Record<string, string[]>, stillAllowed = () => true) {
  const result = await connectors.relayMcp({}, { id: 1, method: 'tools/call', params: { name, arguments: args } }, undefined, { botId: 'fixture-bot', accounts, stillAllowed });
  return JSON.parse(result.bytes.toString()).result;
}
describe('OpenClaw connected-account boundary', () => {
  it('stores only an inventory in the app and sends the token to the exact OpenClaw profile', async () => {
    add('token');
    const auth = await connectors.authorizeService({}, 'fixture', 'work', 'https://app.invalid');
    expect(auth.kind).toBe('form');
    await expect(connectors.submitAuth(auth.id, { token: 'private', unexpected: 'field' })).rejects.toThrow();
    await connectors.submitAuth(auth.id, { token: 'fixture-private-token' }); await done(auth.id);
    const disk = readFileSync(join(mocks.directory, 'connectors/accounts.json'), 'utf8');
    expect(disk).not.toContain('fixture-private-token');
    expect(mocks.request.mock.calls.some(([method, params]) => method === 'config.patch' && params.raw.includes('Bearer fixture-private-token'))).toBe(true);
    expect((await call('connectors_list_accounts', {}, {})).content[0].text).toBe('[]');
    expect((await call('connectors_list_accounts', {}, { fixture: [auth.accountId] })).content[0].text).toContain(auth.accountId);
  });
  it('installs only the selected official native plugin before storing credentials in its gateway', async () => {
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (method, ...args) => {
      if (method === 'plugins.install') return { ok: true };
      if (method === 'channels.status') return { channelOrder: ['slack'], channelAccounts: { slack: [{ accountId: 'default', configured: true, probe: { ok: true } }] } };
      return original(method, ...args);
    });
    const auth = await connectors.authorizeService({}, 'slack', 'work');
    await connectors.submitAuth(auth.id, { botToken: 'fixture-bot-token', appToken: 'fixture-app-token' });
    await done(auth.id);
    const install = mocks.request.mock.calls.findIndex(([method]) => method === 'plugins.install');
    const configure = mocks.request.mock.calls.findIndex(([method]) => method === 'config.patch');
    expect(install).toBeLessThan(configure);
    expect(mocks.request.mock.calls[install][1]).toEqual({ source: 'npm', spec: '@openclaw/slack@2026.9.6', pin: true, expectedPluginId: 'slack' });
    const patch = JSON.parse(mocks.request.mock.calls[configure][1].raw);
    expect(patch.channels.slack).toMatchObject({ botToken: 'fixture-bot-token', dmPolicy: 'disabled', groupPolicy: 'disabled' });
    expect(patch.plugins.load).toBeUndefined();
    expect(readFileSync(join(mocks.directory, 'connectors/accounts.json'), 'utf8')).not.toContain('fixture-bot-token');
  });
  it('requires the exact account, validates schemas, and rechecks revocation after discovery', async () => {
    add(); const a = await connectors.authorizeService({}, 'fixture', 'work'); await done(a.id);
    const b = await connectors.authorizeService({}, 'fixture', 'personal'); await done(b.id);
    const grants = { fixture: [a.accountId] };
    const args = { service: 'fixture', accountId: b.accountId, tool: tool.name, arguments: { text: 'hello' } };
    expect((await call('connectors_execute_tool', args, grants)).isError).toBe(true);
    args.accountId = a.accountId;
    expect((await call('connectors_execute_tool', { ...args, arguments: { text: 12 } }, grants)).isError).toBe(true);
    let allowed = true;
    mocks.request.mockImplementationOnce(async () => { allowed = false; return { tools: [tool] }; });
    expect((await call('connectors_execute_tool', args, grants, () => allowed)).isError).toBe(true);
    expect(mocks.request.mock.calls.filter(([name]) => name === 'omb.connectors.call')).toHaveLength(0);
    expect((await call('connectors_execute_tool', args, grants)).isError).toBeUndefined();
    expect(mocks.request.mock.calls.filter(([name]) => name === 'omb.connectors.call')).toHaveLength(1);
    await connectors.removeAccount({}, 'fixture', a.accountId);
    expect((await call('connectors_execute_tool', args, grants)).isError).toBe(true);
    expect((await connectors.connectedServices({})).fixture.accounts.map(a => a.id)).toEqual([b.accountId]);
  });
  it('binds OAuth handoff to the gateway state and origin, rejects replay and never returns tokens', async () => {
    add('oauth'); let authorized = false;
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (method, ...params) => method === 'omb.connectors.authorize'
      ? authorized ? { connected: true } : { connected: false, authorizationUrl: 'https://provider.invalid/authorize?state=gateway-state&redirect_uri=https%3A%2F%2Fapp.invalid%2Foauth%2Fmcp%2Fcallback' }
      : original(method, ...params));
    mocks.completeOAuth.mockImplementation(async () => { authorized = true; });
    const auth = await connectors.authorizeService({}, 'fixture', 'work', 'https://app.invalid');
    await expect.poll(async () => (await connectors.authStatus(auth.id)).kind).toBe('browser');
    for (const callbackUrl of ['https://evil.invalid/oauth/mcp/callback?state=gateway-state&code=test', 'https://app.invalid/oauth/mcp/callback?state=wrong&code=test']) {
      await expect(connectors.submitAuth(auth.id, { callbackUrl })).rejects.toThrow();
    }
    expect(mocks.completeOAuth).not.toHaveBeenCalled();
    const callback = new URL('https://app.invalid/oauth/mcp/callback?state=gateway-state&code=test');
    await connectors.oauthCallback(callback); await done(auth.id);
    await expect(connectors.oauthCallback(callback)).rejects.toThrow();
    expect(mocks.completeOAuth).toHaveBeenCalledTimes(1);
    expect(await connectors.authStatus(auth.id)).not.toHaveProperty('url', expect.any(String));
  });
  it('joins a pending connection across devices and cancels without touching another account', async () => {
    add('token'); const a = await connectors.authorizeService({}, 'fixture', 'work');
    const joined = await connectors.authorizeService({}, 'fixture', 'work'); expect(joined.id).toBe(a.id);
    const b = await connectors.authorizeService({}, 'fixture', 'personal');
    await connectors.cancelAuth(a.id);
    expect((await connectors.authStatus(a.id)).kind).toBe('cancelled');
    await expect(connectors.submitAuth(a.id, { token: 'late' })).rejects.toThrow();
    expect((await connectors.connectedServices({})).fixture.accounts.map(a => a.id)).toEqual([b.accountId]);
    expect(existsSync(join(mocks.directory, 'connectors/accounts', a.accountId))).toBe(false);
  });
  it('expires abandoned connections even when no client polls', async () => {
    vi.useFakeTimers(); add('token'); const a = await connectors.authorizeService({}, 'fixture', 'work');
    await vi.advanceTimersByTimeAsync(11 * 60_000);
    expect((await connectors.authStatus(a.id)).kind).toBe('cancelled');
    expect(await connectors.connectedServices({})).toEqual({});
  });
});

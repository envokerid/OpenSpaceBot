// Headless app -> OpenClaw -> fake OAuth/MCP verification. No live accounts.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchVerificationServer, runControlOmb } from './control-omb.ts';
import type { ConnectorAuthState } from '../shared/connector-auth.ts';
let origin = ''; let challenge = ''; let exchanges = 0;
const provider = createServer(async (req, res) => {
  const url = new URL(req.url!, origin); let raw = '';
  for await (const chunk of req) raw += chunk;
  const json = (value: unknown, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname.includes('oauth-protected-resource')) return json({ resource: `${origin}/mcp`, authorization_servers: [origin] });
  if (url.pathname.includes('oauth-authorization-server')) return json({ issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`, response_types_supported: ['code'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] });
  if (url.pathname === '/register') return json({ ...JSON.parse(raw), client_id: 'fixture-client', token_endpoint_auth_method: 'none' }, 201);
  if (url.pathname === '/authorize') {
    challenge = url.searchParams.get('code_challenge')!;
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', url.searchParams.get('state')!); callback.searchParams.set('code', 'fixture-code');
    res.writeHead(302, { location: callback.href }); return res.end();
  }
  if (url.pathname === '/token') {
    const form = new URLSearchParams(raw);
    if (form.get('code') !== 'fixture-code' || createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') !== challenge) return json({ error: 'invalid_grant' }, 400);
    exchanges++; return json({ access_token: 'private-fixture-access-token', token_type: 'Bearer', expires_in: 3600 });
  }
  if (url.pathname !== '/mcp') return json({}, 404);
  if (req.headers.authorization !== 'Bearer private-fixture-access-token') {
    res.setHeader('www-authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`); return json({}, 401);
  }
  if (req.method !== 'POST') return json({}, 405);
  const message = JSON.parse(raw); if (message.id === undefined) { res.writeHead(202); return res.end(); }
  const result = message.method === 'initialize' ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'isolated-connector', version: '1' } } : { tools: [{ name: 'echo', description: 'Fixture only', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] };
  json({ jsonrpc: '2.0', id: message.id, result });
});
await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
const address = provider.address(); assert(address && typeof address !== 'string'); origin = `http://127.0.0.1:${address.port}`;
let fixture: Awaited<ReturnType<typeof launchVerificationServer>> | undefined;
try {
  fixture = await launchVerificationServer(process.env);
  const { url, dataDir, logPath } = fixture.info;
  const request = async <T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const response = await fetch(`${url}${path}`, { method, headers: { 'content-type': 'application/json', origin: url }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); assert(response.ok, `HTTP ${response.status}: ${JSON.stringify(result)}`); return result as T;
  };
  const doctor = await runControlOmb(['doctor', '--url', url]);
  await request('/api/connectors/providers', 'POST', { slug: 'fixture', label: 'Isolated OAuth', url: `${origin}/mcp`, auth: 'oauth' });
  const bot = (await request<{ bot: { id: string; threadId: string } }>('/api/bots', 'POST', { name: 'Connector verification' })).bot;
  const auth = await request<ConnectorAuthState>('/api/connectors/fixture/authorize', 'POST', { alias: 'work' });
  const until = async (kind: string) => {
    const deadline = Date.now() + 90_000;
    for (;;) {
      const state = await request<ConnectorAuthState>(`/api/connectors/auth/${auth.id}`);
      if (state.kind === kind) return state;
      assert(!['failed', 'cancelled'].includes(state.kind), JSON.stringify(state)); assert(Date.now() < deadline, `Timed out waiting for ${kind}`);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  };
  const browser = await until('browser'); assert(browser.url);
  const redirect = await fetch(browser.url, { redirect: 'manual' }); const callback = redirect.headers.get('location'); assert(callback);
  const wrong = new URL(callback); wrong.searchParams.set('state', 'wrong'); assert.equal((await fetch(wrong)).status, 400); assert.equal(exchanges, 0);
  assert.equal((await fetch(callback)).status, 200); await until('connected'); assert.equal(exchanges, 1);
  assert.equal((await fetch(callback)).status, 400);
  let bots = await request<{ bots: Array<{ id: string; connectorAccounts?: Record<string, string[]> }> }>('/api/bots?messages=0');
  assert.equal(bots.bots.find(b => b.id === bot.id)?.connectorAccounts, undefined);
  await request(`/api/bots/${bot.id}/connector-accounts/fixture/${auth.accountId}`, 'POST');
  bots = await request('/api/bots?messages=0'); assert.deepEqual(bots.bots.find(b => b.id === bot.id)?.connectorAccounts, { fixture: [auth.accountId] });
  assert(!readFileSync(join(dataDir, 'connectors/accounts.json'), 'utf8').includes('private-fixture-access-token'));
  await request(`/api/connectors/fixture/accounts/${auth.accountId}`, 'DELETE');
  bots = await request('/api/bots?messages=0'); assert.deepEqual(bots.bots.find(b => b.id === bot.id)?.connectorAccounts, {});
  const evidence = { ok: true, fixture: fixture.info, doctor, checks: ['app-owned public callback forwards to OpenClaw', 'OpenClaw PKCE token exchange', 'wrong state and replay denied', 'connection grants no bot access', 'exact account grant', 'disconnect prunes grants', 'inventory contains no token'] };
  writeFileSync(`${logPath}.openclaw.json`, JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
} finally {
  await fixture?.close(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve()));
}

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freePortBlock } from './testing/ports.ts';
import { removeTempDir, waitForExit } from './testing/cleanup.ts';
import { createProxyHandler } from '../companion/src/proxy.ts';
import { Client, APIError } from '../expo/src/core/client.ts';
import { endpoint } from '../expo/src/core/pairing.ts';
import { vmControl } from '../expo/src/core/computer.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
let home = '', base = '', log = '', inputFile = '';
let child: ChildProcess;
let sidecar: Server;
let client: Client;
let allowed = false;
const api = async (path: string, method = 'GET', body?: unknown) => {
 const result = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
 expect(result.ok).toBe(true); return result.json() as Promise<any>;
};
beforeAll(async () => {
 home = mkdtempSync(join(tmpdir(), 'omb-mobile-vm-'));
 const data = join(home, 'data'); mkdirSync(data); inputFile = join(data, 'inputs.jsonl'); writeFileSync(inputFile, '');
 writeFileSync(join(data, 'config.json'), JSON.stringify({ localVm: { mode: 'shared' }, instances: { claude: { driver: 'claudeAgent', config: { cli: join(root, 'server/testing/fake-claude-cli.ts') }, environment: { FAKE_CLAUDE_MODE: 'slow', FAKE_CLAUDE_DUMP: join(data, 'engine.json'), FAKE_CLAUDE_SLOW_FINISH_GATE: join(data, 'finish') } } } }));
 const port = await freePortBlock([0, 1]); base = `http://127.0.0.1:${port}`;
 child = spawn(process.execPath, ['--import', pathToFileURL(join(root, 'server/testing/mobile-vm-hooks.mjs')).href, join(root, 'server/index.ts')], {
  cwd: root, env: { PATH: dirname(process.execPath), HOME: home, USERPROFILE: home, OMB_DATA_DIR: data, OMB_PORT: String(port), OMB_WEBHOOK_PORT: String(port + 1), OMB_MOBILE_VM_INPUTS: inputFile, TMPDIR: home, APPDATA: join(home, 'appdata'), LOCALAPPDATA: join(home, 'localappdata') }, stdio: ['ignore', 'pipe', 'pipe'],
 });
 child.stdout!.on('data', () => {}); child.stderr!.on('data', data => { log += data; });
 const deadline = Date.now() + 30_000;
 for (;;) {
  try { if ((await fetch(base + '/api/health')).ok) break; } catch {}
  if (child.exitCode !== null || Date.now() > deadline) throw new Error(log);
  await new Promise(resolve => setTimeout(resolve, 100));
 }
 sidecar = createServer(createProxyHandler({ harnessPort: port, authenticate: token => token === 'fixture-phone' ? { id: 'phone', cloudDesktopAccess: allowed } : null, redeem: () => ({ error: 'unused' }), serverName: () => 'VM fixture' }));
 await new Promise<void>(resolve => sidecar.listen(0, '127.0.0.1', resolve));
 const origin = `http://127.0.0.1:${(sidecar.address() as { port: number }).port}`;
 client = new Client({ id: 'fixture', name: 'Fixture', endpoint: endpoint(origin), endpoints: [], server: false }, 'fixture-phone');
}, 45_000);
afterAll(async () => {
 if (sidecar) await new Promise<void>(resolve => sidecar.close(() => resolve()));
 await waitForExit(child, { signal: 'SIGTERM' });
 if (home) await removeTempDir(home);
});
it('takes, types and releases through the real phone proxy, with capability and thread isolation', async () => {
 const { bot } = await api('/api/bots', 'POST', { name: 'Mobile VM fixture' });
 await api(`/api/bots/${bot.id}`, 'PATCH', { computer: 'vm' });
 const selected = bot.threadId;
 const lease = 'phone-lease-123456789';
 await expect(vmControl(client, bot.id, selected, lease, 'take')).rejects.toMatchObject({ status: 403 });
 allowed = true;
 await expect(vmControl(client, bot.id, selected, lease, 'input', { type: 'text', text: 'before hold' })).rejects.toMatchObject({ status: 409 });
 expect(await vmControl(client, bot.id, selected, lease, 'take')).toEqual({ held: true });
 expect((await api(`/api/bots/${bot.id}/computer/control`)).held).toBe(true);
 await expect(vmControl(client, bot.id, selected, 'other-lease-123456', 'take')).rejects.toMatchObject({ status: 409 });
 await vmControl(client, bot.id, selected, lease, 'input', { type: 'click', x: 125, y: 80 });
 await vmControl(client, bot.id, selected, lease, 'input', { type: 'text', text: 'Hello VM 東京' });
 const inputs = readFileSync(inputFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
 expect(inputs.map(row => row.input.type)).toEqual(['click', 'text']);
 expect(inputs[1].input.text).toBe('Hello VM 東京');
 const sibling = await client.createTask({ kind: 'bots', id: bot.id, threadId: selected }, 'Sibling');
 await expect(vmControl(client, bot.id, sibling.bot!.threadId, lease, 'input', { type: 'key', key: 'Return' })).rejects.toBeInstanceOf(APIError);
 await vmControl(client, bot.id, selected, lease, 'renew');
 await vmControl(client, bot.id, selected, lease, 'release');
 expect((await api(`/api/bots/${bot.id}/computer/control`)).held).toBe(false);
 await expect(vmControl(client, bot.id, selected, lease, 'input', { type: 'text', text: 'after release' })).rejects.toMatchObject({ status: 409 });
 expect(readFileSync(inputFile, 'utf8').trim().split('\n')).toHaveLength(2);
 await api(`/api/bots/${bot.id}`, 'PATCH', { computer: 'local' });
 await expect(vmControl(client, bot.id, selected, lease, 'take')).rejects.toMatchObject({ status: 409 });
}, 30_000);

it('pauses another bot using the same shared VM until the phone returns control', async () => {
 const { bot: worker } = await api('/api/bots', 'POST', { name: 'Shared VM worker' });
 const { bot: panel } = await api('/api/bots', 'POST', { name: 'Shared VM phone' });
 for (const bot of [worker, panel]) await api(`/api/bots/${bot.id}`, 'PATCH', { computer: 'vm' });
 await api(`/api/bots/${worker.id}/messages`, 'POST', { text: 'Fixture shared VM work' });
 const file = join(home, 'data', 'engine.json');
 const deadline = Date.now() + 15_000;
 let engine: any;
 while (!engine) {
  try { if (existsSync(file)) engine = JSON.parse(readFileSync(file, 'utf8')); } catch {}
  if (Date.now() > deadline) throw new Error('No fake-engine computer configuration: ' + log);
  await new Promise(resolve => setTimeout(resolve, 50));
 }
 const gate = engine.mcpConfig.mcpServers.computer.env;
 const status = async () => {
  const response = await fetch(gate.OMB_CONTROL_URL, { headers: { authorization: `Bearer ${gate.OMB_CONTROL_TOKEN}` } });
  expect(response.ok).toBe(true); return response.json() as Promise<{ held: boolean }>;
 };
 expect((await status()).held).toBe(false);
 const lease = 'shared-phone-lease-12345';
 await vmControl(client, panel.id, panel.threadId, lease, 'take');
 expect((await status()).held).toBe(true);
 await vmControl(client, panel.id, panel.threadId, lease, 'release');
 expect((await status()).held).toBe(false);
 await api(`/api/bots/${worker.id}/interrupt`, 'POST', {});
}, 30_000);

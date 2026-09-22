// Run from the repository root with Node >=24. No URL override exists: every
// mutation is constrained to the fixture this script itself launches.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { launchVerificationServer, runControlOmb } from '../../scripts/control-omb.ts';
import { APIError, Client, pair } from '../src/core/client.ts';
import { parseInvite } from '../src/core/pairing.ts';
import { Session } from '../src/core/session.ts';
import { verifyPermissions } from './verify-permissions.ts';
import { verifyGroupMembers } from './verify-group-members.ts';
import { verifyGroupSetup } from './verify-group-setup.ts';
import { verifyRosterActions } from './verify-roster-actions.ts';

const fixture = await launchVerificationServer();
process.env.OMB_COMPANION_DIR = join(fixture.info.dataDir, 'expo-companion');
const { DeviceRegistry } = await import('../../companion/src/devices.ts');
const { createProxyHandler } = await import('../../companion/src/proxy.ts');
const registry = new DeviceRegistry();
const evidence: unknown[] = [{ fixture: fixture.info }];
const sidecar = createServer(createProxyHandler({ harnessPort: Number(new URL(fixture.info.url).port), authenticate: value => registry.authenticate(value), redeem: (code, name, requestId) => registry.redeem(code, name, requestId), serverName: () => 'Expo fixture' }));
let session: Session | undefined;
const control = async (args: string[]) => { const result = await runControlOmb([...args, '--url', fixture.info.url]); evidence.push({ command: args, result }); return result as any; };
const waitUntil = async (fn: () => boolean, label: string) => { const end = Date.now() + 20_000; while (!fn()) { if (Date.now() > end) throw new Error(`Timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 100)); } };
try {
  sidecar.listen(0, '127.0.0.1'); await once(sidecar, 'listening');
  const address = sidecar.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const window = registry.openPairing();
  const invite = parseInvite(`openmausbot://pair?address=${encodeURIComponent(origin)}&token=${window.token}`);
  const paired = await pair(invite, 'Expo verification', randomUUID());
  const client = new Client(paired.connection, paired.token);
  evidence.push({ action: 'pair through companion sidecar', status: 'ok', origin });
  await assert.rejects(() => new Client(paired.connection, 'invalid').fleet(), /pair|401/i);
  await assert.rejects(() => client.request('/api/config', 'PUT', { profile: { name: 'Denied' } }), (error: unknown) => error instanceof APIError && error.status === 403);
  const created = await control(['new-bot', '--name', 'Expo Probe']);
  const botId = created.bot.id;
  let bot = (await client.fleet()).bots.find(b => b.id === botId)!;
  assert.ok(bot);
  const first = { kind: 'bots' as const, id: bot.id, threadId: bot.threadId };
  const createdTask = await client.createTask(first, 'Expo independent thread');
  const second = { ...first, threadId: createdTask.bot!.threadId };
  // Return the desktop to its first thread. Opening the sibling on the phone
  // must not issue POST tasks/:id and move the desktop's selection.
  await client.task(first, 'POST');
  session = new Session(client); session.start();
  await waitUntil(() => session?.state.status === 'connected', 'SSE connection');
  await session.load(second.threadId);
  assert.equal((await client.fleet()).bots.find(b => b.id === botId)!.threadId, first.threadId);
  const sendId = randomUUID();
  await client.send(second, 'Expo fixture: hello from the shared mobile client.', sendId);
  evidence.push({ action: 'mobile send', bot: botId, thread: second.threadId, sendId });
  const settled = await control(['wait', '--bot', botId, '--task', second.threadId, '--timeout', '30']);
  assert.equal(settled.state ?? settled.status, 'settled');
  const page = await client.page(second.threadId);
  assert.ok(page.messages.some(m => m.role === 'bot' && m.kind === 'text'));
  await client.send(second, 'Expo fixture: hello from the shared mobile client.', sendId);
  assert.equal((await client.page(second.threadId)).messages.filter(m => m.sendId === sendId).length, 1);
  await waitUntil(() => !!session?.state.pages[second.threadId]?.messages.some(m => m.role === 'bot' && m.kind === 'text'), 'SSE reply');
  await client.read(second);
  await client.task(second, 'PATCH', { title: 'Renamed by Expo' });
  bot = (await client.fleet()).bots.find(b => b.id === botId)!;
  assert.equal(bot.tasks!.find(t => t.threadId === second.threadId)!.title, 'Renamed by Expo');
  const results = await client.search('Expo fixture'); assert.ok(results.hits.some(h => h.threadId === second.threadId));
  const upload = await client.upload(new TextEncoder().encode('Expo file contents'), 'expo-fixture.txt', 'text/plain', randomUUID());
  assert.ok(upload.path); assert.equal(upload.name, 'expo-fixture.txt');
  const userMessage = page.messages.find(m => m.sendId === sendId)!;
  await client.edit(second, userMessage.id, 'Expo fixture: edited from the phone');
  await control(['wait', '--bot', botId, '--task', second.threadId, '--timeout', '30']);
  const edited = await client.page(second.threadId);
  assert.ok(edited.messages.some(m => m.role === 'user' && m.text === 'Expo fixture: edited from the phone'));
  const branch = await client.request<{ activeLeafId: string }>(`/api/bots/${botId}/active-branch`, 'POST', { threadId: second.threadId, messageId: userMessage.id });
  assert.ok(branch.activeLeafId);
  assert.equal((await client.page(second.threadId)).activeLeafId, branch.activeLeafId);
  const avatar = await client.upload(new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64')), 'expo-avatar.png', 'image/png', randomUUID());
  const avatarPath = `/api/attachments/${avatar.path.split('/').pop()}`;
  await client.request(`/api/bots/${botId}/profile`, 'PATCH', { avatarUrl: avatarPath, avatarCrop: 'circle', mascotBody: 'blob' });
  assert.equal((await client.fleet()).bots.find(b => b.id === botId)!.avatarUrl, avatarPath);
  assert.match((await client.response(avatarPath)).headers.get('content-type')!, /image\/png/);
  const routine = await client.request<{ routine: { id: string } }>('/api/routines', 'POST', { name: 'Expo schedule', prompt: 'Fixture routine', target: 'bot', botId, runOn: 'maus', schedule: { type: 'once', at: Date.now() + 86_400_000 }, timeoutMinutes: 10, overlap: 'skip' });
  await client.request(`/api/routines/${routine.routine.id}`, 'PATCH', { schedule: { type: 'daily', time: '09:30', weekdays: [1, 2, 3, 4, 5] }, enabled: false });
  const routines = await client.request<{ routines: { id: string; enabled: boolean; schedule: { type: string } }[] }>('/api/routines');
  assert.ok(routines.routines.some(r => r.id === routine.routine.id && !r.enabled && r.schedule.type === 'daily'));
  await client.request(`/api/routines/${routine.routine.id}`, 'DELETE');
  evidence.push({ action: 'edit and switch message version, custom avatar upload/read/profile, routine create/edit/pause/delete', status: 'passed' });
  evidence.push(await verifyPermissions(client, session, botId));
  evidence.push(await verifyGroupMembers(client, session, botId));
  evidence.push(await verifyGroupSetup(client, (await client.fleet()).bots.filter(bot => !bot.hidden).slice(0, 2).map(bot => bot.id), control));
  evidence.push(await verifyRosterActions(client, session));
  await control(['messages', '--bot', botId, '--task', second.threadId, '--limit', '10']);
  const cursor = session.state.cursor; assert.ok(cursor); session.stop(); session.start();
  await waitUntil(() => session?.state.status === 'connected', 'resume');
  assert.equal((await client.fleet()).bots.find(b => b.id === botId)!.threadId, first.threadId);

  const gate = join(fixture.info.dataDir, 'expo-finish.gate');
  const dumpPath = join(fixture.info.dataDir, 'expo-approval-dump.json');
  const wrapper = join(fixture.info.dataDir, 'expo-gated-engine.mjs');
  writeFileSync(wrapper, [
    '#!/usr/bin/env node',
    'process.env.FAKE_CLAUDE_MODE = "slow";',
    `process.env.FAKE_CLAUDE_SLOW_FINISH_GATE = ${JSON.stringify(gate)};`,
    `process.env.FAKE_CLAUDE_DUMP = ${JSON.stringify(dumpPath)};`,
    `await import(${JSON.stringify(pathToFileURL(join(process.cwd(), 'server/testing/fake-claude-cli.ts')).href)});`,
  ].join('\n'), { mode: 0o700 });
  const configured = await fetch(`${fixture.info.url}/api/instances/claude`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cli: wrapper }) });
  assert.equal(configured.status, 200);
  await client.task(second, 'PATCH', { approvalMode: 'ask' });
  await client.send(second, 'Expo approval fixture', randomUUID());
  await waitUntil(() => existsSync(dumpPath), 'fixture engine dump');
  await assert.rejects(() => client.permissions(botId, { approvalMode: 'auto' }), /stop this bot/i);
  evidence.push({ action: 'reject approval-level change while bot is working', status: 'passed' });
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
  const socket = connect(dump.mcpConfig.mcpServers.ogb.args.at(-1));
  await once(socket, 'connect');
  const answers: unknown[] = [];
  const lines = createInterface({ input: socket }); lines.on('line', line => answers.push(JSON.parse(line)));
  try {
    socket.write(`${JSON.stringify({ t: 'ask', id: 'expo-permission', kind: 'permission', tool: 'Bash', input: { command: 'ls -la ./dist' } })}\n`);
    await waitUntil(() => !!session?.state.pages[second.threadId]?.messages.find(m => m.card?.requestId && !m.card.answered), 'approval on mobile stream');
    const card = session.state.pages[second.threadId].messages.find(m => m.card?.requestId && !m.card.answered)!.card!;
    await client.respond(second.threadId, card.requestId!, 'allow');
    await waitUntil(() => answers.length > 0, 'approval delivered to engine');
    evidence.push({ action: 'approval answered through mobile client', thread: second.threadId, behavior: 'allow', receipt: answers });
    writeFileSync(gate, 'finish');
    const resumed = await control(['wait', '--bot', botId, '--task', second.threadId, '--timeout', '30']);
    assert.equal(resumed.state ?? resumed.status, 'settled');
  } finally { lines.close(); socket.destroy(); }

  if (process.argv.includes('--interactive')) {
    // Fresh pairing window for a disposable emulator; never point a UI test
    // at the user's real app. Ctrl-C owns cleanup of this exact fixture.
    const printPairing = () => {
      const next = registry.openPairing();
      console.log(JSON.stringify({ fixtureUrl: fixture.info.url, companionUrl: origin, pairingCode: next.code, pairingLink: `openmausbot://pair?address=${encodeURIComponent(origin)}&token=${next.token}`, botId }));
    };
    printPairing();
    console.log('Enter pair to refresh the two-minute pairing window. Ctrl-C stops this fixture.');
    const input = createInterface({ input: process.stdin });
    input.on('line', line => { if (line.trim() === 'pair') printPairing(); });
    await new Promise<void>(resolve => process.once('SIGINT', resolve));
    input.close();
  }
  const device = registry.authenticate(paired.token); assert.ok(device);
  registry.revoke(device.id);
  await assert.rejects(() => client.fleet(), /pair|401/i);
  evidence.push({ action: 'local thread selection, paged transcript, SSE resume, idempotent retry, rename, search, upload, revocation', status: 'passed' });
  console.log(JSON.stringify({ status: 'passed', logPath: fixture.info.logPath, evidencePath: `${fixture.info.logPath}.expo.json` }));
} finally {
  session?.stop(); sidecar.closeAllConnections();
  await new Promise<void>(resolve => sidecar.close(() => resolve()));
  writeFileSync(`${fixture.info.logPath}.expo.json`, JSON.stringify(evidence, null, 2));
  await fixture.close();
}

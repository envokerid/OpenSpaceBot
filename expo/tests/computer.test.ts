import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureComputer, captureVmFrame, computerPreview } from '../src/core/computer.ts';
import { Client } from '../src/core/client.ts';
import { initialState, fold } from '../src/core/store.ts';
import { endpoint } from '../src/core/pairing.ts';

const connection = { id: 'fixture', name: 'Fixture', endpoint: endpoint('127.0.0.1:8810'), endpoints: [], server: false };
test('takeover frames use one authenticated thread-scoped request and propagate surface changes', async () => {
 let changed = false;
 let calls = 0;
 const client = new Client(connection, 'fixture', async (input, init) => {
  calls++;
  const url = new URL(String(input));
  assert.equal(url.pathname, '/api/bots/bot/local-computer/screenshot');
  assert.equal(url.searchParams.get('threadId'), 'phone-thread');
  assert.equal(init?.method, 'POST');
  assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer fixture');
  return changed ? Response.json({ error: 'This conversation is not using the Local VM' }, { status: 409 }) : Response.json({ image: 'data:image/png;base64,YQ==' });
 });
 const signal = new AbortController().signal;
 assert.equal((await captureVmFrame(client, 'bot', 'phone-thread', signal)).uri, 'data:image/png;base64,YQ==');
 assert.equal(calls, 1);
 changed = true;
 await assert.rejects(captureVmFrame(client, 'bot', 'phone-thread', signal), /not using the Local VM/);
 assert.equal(calls, 2);
});
test('idle Auto VM uses server discovery and pins discovery and capture to the phone thread', async () => {
 const calls: string[] = [];
 const client = new Client(connection, 'fixture', async (input, init) => {
  const url = new URL(String(input)); calls.push(url.pathname);
  assert.equal(url.searchParams.get('threadId'), 'phone-thread');
  if (url.pathname.endsWith('/computer')) return Response.json({ surface: 'vm' });
  assert.equal(init?.method, 'POST');
  return Response.json({ image: 'data:image/png;base64,YQ==' });
 });
 assert.deepEqual(await captureComputer(client, 'bot', 'phone-thread', new AbortController().signal), { surface: 'vm', uri: 'data:image/png;base64,YQ==' });
 assert.deepEqual(calls, ['/api/bots/bot/computer', '/api/bots/bot/local-computer/screenshot']);
});
test('frames and saved captures never cross sibling threads or branches', () => {
 let state = initialState();
 state = fold(state, { kind: 'screen', botId: 'bot', threadId: 'sibling', png: 'other' });
 state.pages.selected = { activeLeafId: 'selected-reply', messages: [
  { id: 'old-screen', kind: 'screen', role: 'bot', at: 1 },
  { id: 'other-screen', kind: 'screen', role: 'bot', at: 3 },
  { id: 'selected-reply', kind: 'text', role: 'bot', parentId: 'old-screen', at: 4 },
 ] };
 assert.equal(computerPreview(state, 'bot', 'selected').live, undefined);
 assert.match(computerPreview(state, 'bot', 'selected').savedPath!, /old-screen\/image$/);
 state = fold(state, { kind: 'screen', botId: 'bot', threadId: 'selected', png: 'selected', mime: 'image/jpeg' });
 assert.equal(computerPreview(state, 'bot', 'selected').live?.png, 'selected');
});
test('non-VM surfaces do not capture the host computer and capture errors are recoverable', async () => {
 let surface = 'local'; let failed = false;
 const calls: string[] = [];
 const client = new Client(connection, 'fixture', async input => {
  calls.push(String(input));
  if (String(input).includes('/computer?')) return Response.json({ surface });
  if (failed) return Response.json({ error: 'VM stopped' }, { status: 409 });
  return Response.json({ image: 'data:image/png;base64,YQ==' });
 });
 assert.deepEqual(await captureComputer(client, 'bot', 'thread', new AbortController().signal), { surface: 'local' });
 assert.equal(calls.length, 1);
 surface = 'vm'; failed = true;
 await assert.rejects(captureComputer(client, 'bot', 'thread', new AbortController().signal), /VM stopped/);
 failed = false;
 assert.ok((await captureComputer(client, 'bot', 'thread', new AbortController().signal)).uri);
});

test('touch mapping respects portrait/landscape letterboxing and excludes black bars', async () => {
 const { computerPoint } = await import('../src/core/computer.ts');
 assert.equal(computerPoint(100, 20, 400, 800, 1600, 900), undefined);
 assert.deepEqual(computerPoint(200, 400, 400, 800, 1600, 900), { x: 800, y: 450 });
 assert.deepEqual(computerPoint(400, 200, 800, 400, 1600, 900), { x: 800, y: 450 });
 assert.equal(computerPoint(10, 10, 0, 0, 0, 0), undefined);
});
test('VM control pins every operation to the selected thread and sends the same lease', async () => {
 const { vmControl } = await import('../src/core/computer.ts');
 const calls: unknown[] = [];
 const client = new Client(connection, 'fixture', async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.pathname, '/api/bots/bot/local-computer/control');
  assert.equal(url.searchParams.get('threadId'), 'phone-thread');
  assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer fixture');
  calls.push(JSON.parse(String(init?.body))); return Response.json({ held: true });
 });
 for (const action of ['take', 'renew', 'input', 'release'] as const) await vmControl(client, 'bot', 'phone-thread', 'lease', action, action === 'input' ? { type: 'key', key: 'Return' } : undefined);
 assert.deepEqual(calls, [ { action: 'take', controlLeaseId: 'lease' }, { action: 'renew', controlLeaseId: 'lease' }, { action: 'input', controlLeaseId: 'lease', input: { type: 'key', key: 'Return' } }, { action: 'release', controlLeaseId: 'lease' } ]);
});

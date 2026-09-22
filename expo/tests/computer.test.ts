import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureComputer, computerPreview } from '../src/core/computer.ts';
import { Client } from '../src/core/client.ts';
import { initialState, fold } from '../src/core/store.ts';
import { endpoint } from '../src/core/pairing.ts';

const connection = { id: 'fixture', name: 'Fixture', endpoint: endpoint('127.0.0.1:8810'), endpoints: [], server: false };
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

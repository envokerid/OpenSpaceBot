import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AvatarEditor, avatarEditorFor } from '../src/core/avatarEditor.ts';
import type { AvatarPatch } from '../src/core/avatarSettings.ts';
import { Session } from '../src/core/session.ts';
import { Client } from '../src/core/client.ts';
import type { Bot } from '../src/core/types.ts';

const initial: AvatarPatch = { color: 'green', avatarCrop: 'mascot', mascotBody: 'cursor', mascotExpression: null, avatarUrl: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('rapid taps preview immediately and debounce to one save of the final choices', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: AvatarPatch[] = [];
  const editor = new AvatarEditor(initial, async patch => { calls.push(patch); return { ...initial, ...patch }; });
  for (let i = 0; i < 60; i++) {
    const color = i % 2 ? 'blue' : 'coral';
    editor.edit({ color });
    assert.equal(editor.snapshot().appearance.color, color);
    t.mock.timers.tick(10);
  }
  editor.edit({ mascotBody: 'star', mascotExpression: 'happy' });
  assert.equal(calls.length, 0, 'no network work during the burst');
  t.mock.timers.tick(199);
  assert.equal(calls.length, 0);
  t.mock.timers.tick(1);
  await editor.flush();
  assert.deepEqual(calls, [{ color: 'blue', mascotBody: 'star', mascotExpression: 'happy' }]);
  assert.equal(editor.snapshot().pending, false);
});

test('slow saves never block previews, overlap requests, or overwrite newer taps', async () => {
  const first = deferred<AvatarPatch>();
  const second = deferred<AvatarPatch>();
  const calls: AvatarPatch[] = [];
  const editor = new AvatarEditor(initial, patch => { calls.push(patch); return calls.length === 1 ? first.promise : second.promise; });
  editor.edit({ color: 'blue' });
  const saved = editor.flush();
  editor.edit({ color: 'red', mascotBody: 'star' });
  editor.receive({ ...initial, color: 'blue' }); // SSE for the first request
  assert.equal(editor.snapshot().appearance.color, 'red');
  assert.equal(editor.snapshot().appearance.mascotBody, 'star');
  assert.equal(calls.length, 1);
  first.resolve({ ...initial, color: 'blue' });
  await Promise.resolve();
  assert.equal(editor.snapshot().appearance.color, 'red');
  assert.deepEqual(calls[1], { color: 'red', mascotBody: 'star' });
  second.resolve({ ...initial, ...calls[1] });
  await saved;
  assert.equal(editor.snapshot().appearance.color, 'red');
  assert.equal(editor.snapshot().saving, false);
  assert.equal(editor.snapshot().pending, false);
});

test('failed save keeps the latest draft and retry saves all of it without a retry loop', async () => {
  const first = deferred<AvatarPatch>();
  const calls: AvatarPatch[] = [];
  const editor = new AvatarEditor(initial, async patch => { calls.push(patch); return calls.length === 1 ? first.promise : { ...initial, ...patch }; });
  editor.edit({ color: 'blue' });
  const saving = editor.flush();
  editor.edit({ color: 'purple', mascotExpression: 'proud' });
  first.reject(new Error('Offline'));
  await assert.rejects(saving, /Offline/);
  assert.equal(editor.snapshot().error, 'Offline');
  assert.equal(editor.snapshot().appearance.color, 'purple');
  assert.equal(editor.snapshot().pending, true);
  assert.equal(calls.length, 1);
  await editor.flush();
  assert.deepEqual(calls[1], { color: 'purple', mascotExpression: 'proud' });
  assert.equal(editor.snapshot().error, undefined);
  assert.equal(editor.snapshot().pending, false);
});

test('closing flushes pending changes once; no-op selection does not save or rerender', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: AvatarPatch[] = [];
  const editor = new AvatarEditor(initial, async patch => { calls.push(patch); return { ...initial, ...patch }; });
  const original = editor.snapshot();
  editor.edit({ color: 'green' });
  editor.receive(initial);
  assert.equal(editor.snapshot(), original);
  editor.edit({ avatarCrop: 'square' });
  await Promise.all([editor.flush(), editor.flush()]);
  t.mock.timers.tick(1000);
  assert.equal(calls.length, 1);
  assert.equal(editor.snapshot().appearance.avatarCrop, 'square');
});

test('incoming updates affect untouched fields while pending local edits stay visible', async () => {
  const editor = new AvatarEditor(initial, async patch => ({ ...initial, mascotBody: 'star', ...patch }));
  editor.edit({ color: 'yellow' });
  editor.receive({ ...initial, mascotBody: 'star' });
  assert.equal(editor.snapshot().appearance.color, 'yellow');
  assert.equal(editor.snapshot().appearance.mascotBody, 'star');
  await editor.flush();
  editor.receive({ ...initial, color: 'teal', mascotBody: 'star' });
  assert.equal(editor.snapshot().appearance.color, 'teal', 'remote edits still work after saving');
});

test('reopening uses the same writer; different bots and connections stay isolated', async () => {
  const makeClient = () => new Client({ id: 'test', name: 'Test', server: false, endpoint: { url: 'http://localhost', kind: 'lan', priority: 0 }, endpoints: [] }, 'fixture', async () => new Response(JSON.stringify({ bot: { ...initial, color: 'blue' } })));
  const session = new Session(makeClient());
  const bot = { ...initial, id: 'one' } as Bot;
  const first = avatarEditorFor(session, bot);
  first.edit({ color: 'blue' });
  const reopening = avatarEditorFor(session, bot);
  assert.equal(reopening, first);
  assert.equal(reopening.snapshot().appearance.color, 'blue');
  assert.notEqual(avatarEditorFor(session, { ...bot, id: 'two' }), first);
  assert.notEqual(avatarEditorFor(new Session(makeClient()), bot), first);
  await reopening.flush();
});

test('confirmed selection updates the shared bot without SSE or fleet reads', async () => {
  const calls: string[] = [];
  const bot = { ...initial, id: 'bot-one', name: 'Current name', threadId: 'thread', messages: [{ id: 'message', text: 'Keep me' }] } as Bot;
  const client = new Client({ id: 'test', name: 'Test', server: false, endpoint: { url: 'http://localhost', kind: 'lan', priority: 0 }, endpoints: [] }, 'fixture', async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.method, 'PATCH');
    return new Response(JSON.stringify({ bot: { ...bot, ...JSON.parse(String(init.body)), name: 'Stale response name', messages: [] } }));
  });
  const session = new Session(client);
  session.state = { ...session.state, bots: [bot], streaming: { thread: 'In progress' } };
  const before = session.snapshot();
  let notified = 0;
  const unsubscribe = session.subscribe(() => notified++);
  const editor = avatarEditorFor(session, bot);
  editor.edit({ mascotBody: 'star', color: 'blue', mascotExpression: 'happy' });
  await editor.flush();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith('/bot-one/profile'));
  const updated = session.snapshot().bots[0];
  assert.equal(updated.mascotBody, 'star');
  assert.equal(updated.color, 'blue');
  assert.equal(updated.mascotExpression, 'happy');
  assert.equal(updated.name, 'Current name');
  assert.equal(updated.messages, bot.messages);
  assert.equal(session.snapshot().streaming, before.streaming);
  assert.equal(notified, 1);
  assert.equal(avatarEditorFor(session, updated).snapshot().appearance.mascotBody, 'star');
  unsubscribe();
});

test('failed selection never publishes an unsaved avatar to the shared bot', async () => {
  const bot = { ...initial, id: 'bot-one' } as Bot;
  const client = new Client({ id: 'test', name: 'Test', server: false, endpoint: { url: 'http://localhost', kind: 'lan', priority: 0 }, endpoints: [] }, 'fixture', async () => new Response(JSON.stringify({ error: 'Save rejected' }), { status: 400 }));
  const session = new Session(client);
  session.state = { ...session.state, bots: [bot] };
  const editor = avatarEditorFor(session, bot);
  editor.edit({ mascotBody: 'star' });
  await assert.rejects(editor.flush(), /Save rejected/);
  assert.equal(session.snapshot().bots[0], bot);
  assert.equal(editor.snapshot().appearance.mascotBody, 'star');
  assert.equal(editor.snapshot().pending, true);
});

test('a refresh already in flight cannot overwrite a confirmed avatar save', async () => {
  const fleet = deferred<Response>();
  const bot = { ...initial, id: 'bot-one', threadId: 'thread', messages: [] } as unknown as Bot;
  const client = new Client({ id: 'test', name: 'Test', server: false, endpoint: { url: 'http://localhost', kind: 'lan', priority: 0 }, endpoints: [] }, 'fixture', async () => fleet.promise);
  const session = new Session(client);
  session.state = { ...session.state, bots: [bot] };
  const refresh = session.refresh();
  session.applyAvatar(bot.id, { avatarUrl: '/api/attachments/generated.png', avatarCrop: 'circle' });
  fleet.resolve(new Response(JSON.stringify({ bots: [bot], groups: [] })));
  await refresh;
  assert.equal(session.snapshot().bots[0].avatarUrl, '/api/attachments/generated.png');
  assert.equal(session.snapshot().bots[0].avatarCrop, 'circle');
});

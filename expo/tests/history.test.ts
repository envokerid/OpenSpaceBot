import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hydrate, initialState, mergeLatestPage } from '../src/core/store.ts';
import { Session } from '../src/core/session.ts';
import type { Client } from '../src/core/client.ts';
import type { Page } from '../src/core/types.ts';
const message = (id: number) => ({ id: String(id), at: id, role: 'user' as const, kind: 'text' as const, text: String(id) });
const old: Page = { messages: [1, 2, 3, 4].map(message), hasMore: false, activeLeafId: '4' };
const latest: Page = { messages: [3, 4, 5].map(message), hasMore: true, activeLeafId: '5' };

test('latest pages retain loaded older history but respect clears, deletions and disjoint replacements', () => {
  const merged = mergeLatestPage(old, latest);
  assert.deepEqual(merged.messages.map(m => m.id), ['1', '2', '3', '4', '5']);
  assert.equal(merged.hasMore, false);
  assert.equal(merged.activeLeafId, '5');
  assert.deepEqual(mergeLatestPage(old, { messages: [] }).messages, []);
  assert.deepEqual(mergeLatestPage(old, { messages: [message(3)], hasMore: false }).messages.map(m => m.id), ['3'], 'a complete restored snapshot is authoritative');
  assert.deepEqual(mergeLatestPage(old, { messages: [message(9)] }).messages.map(m => m.id), ['9']);
  assert.deepEqual(mergeLatestPage(old, { messages: [message(3), message(5)] }).messages.map(m => m.id), ['1', '2', '3', '5']);
});

test('send refresh and reconnect preserve history; explicit search replaces the window', async () => {
  const session = new Session({ page: async () => latest } as unknown as Client);
  session.state = { ...initialState(), pages: { thread: old } };
  await session.load('thread');
  assert.equal(session.state.pages.thread.messages.length, 5);
  const recovered = hydrate(session.state, { bots: [], groups: [] }, { thread: latest });
  assert.equal(recovered.pages.thread.messages.length, 5);
  await session.load('thread', { around: '4' });
  assert.deepEqual(session.state.pages.thread.messages.map(m => m.id), ['3', '4', '5']);
});

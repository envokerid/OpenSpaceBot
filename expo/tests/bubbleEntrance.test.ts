import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BubbleEntrances } from '../src/core/bubbleEntrance.ts';

test('new user and bot rows enter once; loaded history, patches and remounts stay still', () => {
  const rows = new BubbleEntrances();
  rows.update([], false);
  rows.update(['old-user', 'old-reply'], true);
  assert.equal(rows.claim('old-reply'), false);
  rows.update(['older', 'old-user', 'old-reply', 'user'], true);
  assert.equal(rows.claim('older'), false);
  assert.equal(rows.claim('user'), true);
  rows.update(['older', 'old-user', 'old-reply', 'user', 'reply'], true);
  assert.equal(rows.claim('user'), false);
  assert.equal(rows.claim('reply'), true);
  rows.update(['older', 'old-user', 'old-reply', 'user', 'reply'], true);
  assert.equal(rows.claim('reply'), false);
  rows.update(['different-branch'], true);
  assert.equal(rows.claim('different-branch'), false);
});

test('the first message in an already loaded empty thread can enter', () => {
  const rows = new BubbleEntrances();
  rows.update([], true);
  rows.update(['user', 'reply'], true);
  assert.equal(rows.claim('user'), true);
  assert.equal(rows.claim('reply'), true);
});

test('hidden chats, snapshots and delayed mounts never animate old messages', () => {
  const rows = new BubbleEntrances();
  rows.update(['history'], true, true, [], 0);
  rows.update(['history', 'snapshot'], true, true, [], 10);
  assert.equal(rows.claim('snapshot', 10), false);
  rows.update(['history', 'snapshot', 'live'], true, true, ['live'], 20);
  assert.equal(rows.claim('live', 20), true);
  assert.equal(rows.claim('live', 21), false, 'recycling cannot replay an entrance');
  rows.update(['history', 'snapshot', 'live', 'hidden'], true, false, ['hidden'], 30);
  rows.update(['history', 'snapshot', 'live', 'hidden', 'resumed'], true, true, ['hidden', 'resumed'], 40);
  assert.equal(rows.claim('hidden', 40), false);
  assert.equal(rows.claim('resumed', 40), false, 'catch-up on return is history');
  rows.update(['history', 'snapshot', 'live', 'hidden', 'resumed', 'offscreen'], true, true, ['offscreen'], 50);
  assert.equal(rows.claim('offscreen', 1051), false, 'scrolling to an older arrival must not animate it');
});

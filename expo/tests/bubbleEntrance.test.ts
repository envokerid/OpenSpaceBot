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

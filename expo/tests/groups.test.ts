import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupNeedsSetup } from '../src/core/groups.ts';
import type { Group } from '../src/core/types.ts';

test('only marked, empty user groups need setup; legacy and completed groups remain usable', () => {
  const legacy = { messages: [] } as unknown as Group;
  assert.equal(groupNeedsSetup(legacy), false);
  const pending = { ...legacy, setupCompletedAt: null, setupSkippedAt: null };
  assert.equal(groupNeedsSetup(pending), true);
  assert.equal(groupNeedsSetup({ setupCompletedAt: null, setupSkippedAt: null } as Group), true);
  assert.equal(groupNeedsSetup({ ...pending, dm: true }), false);
  assert.equal(groupNeedsSetup({ ...pending, setupCompletedAt: 1 }), false);
  assert.equal(groupNeedsSetup({ ...pending, setupSkippedAt: 1 }), false);
  assert.equal(groupNeedsSetup({ ...pending, messages: [{} as Group['messages'][number]] }), false);
});

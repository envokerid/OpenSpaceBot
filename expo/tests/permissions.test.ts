import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mobileApprovalSettings } from '../src/core/permissions.ts';
import { fold, hydrate, initialState } from '../src/core/store.ts';
import type { Instance } from '../src/core/types.ts';

const instance = (driverKind: string): Instance => ({ instanceId: 'test', displayName: 'Test', driverKind, models: { default: 'test', options: [] } });

test('mobile approval choices preserve provider semantics and never offer elevated grants', () => {
  for (const driver of ['codex', 'claudeAgent', 'antigravityAgent', 'openai-compat']) {
    const result = mobileApprovalSettings({}, instance(driver));
    assert.ok(result.options.every(o => o.id !== ('full' as string) && o.id !== ('custom' as string)));
    assert.equal(result.options.some(o => o.id === 'edits'), ['claudeAgent', 'antigravityAgent'].includes(driver));
  }
  assert.equal(mobileApprovalSettings({ autoApprove: true }, instance('claudeAgent')).mode, 'auto');
  const antigravity = mobileApprovalSettings({ autoApprove: true }, instance('antigravityAgent'));
  assert.equal(antigravity.mode, 'ask');
  assert.ok(!antigravity.options.some(o => o.id === 'auto'));
  assert.match(mobileApprovalSettings({}, instance('openai-compat')).options.find(o => o.id === 'auto')!.description, /behaves like Ask/);
});

test('Custom stays locked even without a provider; busy bots cannot change approval levels', () => {
  assert.equal(mobileApprovalSettings({ approvalMode: 'custom' }).locked, true);
  assert.equal(mobileApprovalSettings({ approvalMode: 'custom' }, instance('codex')).locked, true);
  assert.equal(mobileApprovalSettings({ busy: true }, instance('claudeAgent')).locked, true);
  assert.equal(mobileApprovalSettings({ approvalMode: 'full' }, instance('claudeAgent')).locked, false);
  assert.equal(mobileApprovalSettings({ approvalMode: 'full' }, instance('claudeAgent')).mode, 'full');
});

test('empty teams survive fleet hydration and section events for Chief team access', () => {
  const state = hydrate(initialState(), { bots: [], groups: [], sections: ['Empty team'] });
  assert.deepEqual(state.sections, ['Empty team']);
  assert.deepEqual(fold(state, { kind: 'sections', sections: ['Renamed'] }).sections, ['Renamed']);
});

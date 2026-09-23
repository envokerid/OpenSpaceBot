import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settleSendDraft } from '../src/core/sendDraft.ts';
import type { Draft } from '../src/core/types.ts';

test('goals reset after sending, survive failure, and mode changes invalidate retries', () => {
  const goal: Draft = { text: 'Ship the draft', files: [], channelMode: 'goal' };
  assert.deepEqual(settleSendDraft(goal, goal, 'receipt'), { text: '', files: [] });
  assert.equal(settleSendDraft(goal, goal, 'receipt', true).channelMode, 'goal');
  assert.equal(settleSendDraft(goal, goal, 'receipt', true).sendId, 'receipt');
  const next: Draft = { ...goal, channelMode: 'chat' };
  assert.equal(settleSendDraft(next, goal, 'receipt', true).sendId, undefined);
  assert.equal(settleSendDraft(next, goal, 'receipt').text, goal.text);
  assert.equal(settleSendDraft(goal, next, 'receipt').channelMode, 'goal');
});

test('accepted sends clear only the submitted draft, preserving edits made in flight', () => {
  const sent: Draft = { text: 'First message', files: [] };
  assert.deepEqual(settleSendDraft({ ...sent, sending: true }, sent, 'receipt'), { text: '', files: [] });
  const edited = { text: 'Next message', files: [], sending: true };
  assert.deepEqual(settleSendDraft(edited, sent, 'receipt'), { ...edited, sending: false, sendId: undefined });
  const attachment = { path: '/new-file', name: 'new.txt' };
  assert.deepEqual(settleSendDraft({ ...sent, files: [attachment], sending: true }, sent, 'receipt').files, [attachment]);
});

test('failed sends retain content and reuse the receipt only when retrying the same payload', () => {
  const sent: Draft = { text: 'Retry me', files: [{ path: '/file', name: 'file.txt' }] };
  const failed = settleSendDraft({ ...sent, sending: true }, sent, 'receipt', true);
  assert.deepEqual(failed, { ...sent, sending: false, sendId: 'receipt' });
  const edited = settleSendDraft({ ...sent, text: 'Changed while sending' }, sent, 'receipt', true);
  assert.equal(edited.text, 'Changed while sending');
  assert.equal(edited.sendId, undefined);
  assert.deepEqual(edited.files, sent.files);
});

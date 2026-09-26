import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composerPayload, insertGoalCommand, suggestCommandsWhileTyping } from '../src/core/goalComposer.ts';
import { transcriptRows } from '../src/core/transcript.ts';
import { settleSendDraft } from '../src/core/sendDraft.ts';
import type { Message } from '../src/core/types.ts';

test('backspacing the goal prefix never opens slash suggestions', () => {
  let before = '/goal ';
  for (const next of ['/goal', '/goa', '/go', '/g', '/', '']) {
    assert.equal(suggestCommandsWhileTyping(before, next), false);
    before = next;
  }
  assert.equal(suggestCommandsWhileTyping('', '/'), true);
  assert.equal(suggestCommandsWhileTyping('/', '/t'), true);
  assert.equal(suggestCommandsWhileTyping('/goal', '/goal text'), false);
});

test('the menu inserts one editable goal prefix without losing existing text', () => {
  assert.equal(insertGoalCommand(''), '/goal ');
  assert.equal(insertGoalCommand('Write a plan'), '/goal Write a plan');
  assert.equal(insertGoalCommand('/goal Write a plan'), '/goal Write a plan');
});

test('typed goal prefixes drive mode and are stripped only in supported groups', () => {
  assert.deepEqual(composerPayload('/goal Write a plan', true), { text: 'Write a plan', mode: 'goal' });
  assert.deepEqual(composerPayload('/GOAL\nWrite\na plan', true), { text: 'Write\na plan', mode: 'goal' });
  for (const text of ['/goal', '/goal   ']) assert.deepEqual(composerPayload(text, true), { text: '', mode: 'goal' });
  for (const text of ['Write a plan', '/goa Write a plan', '/goals Write a plan', 'Explain /goal']) {
    assert.deepEqual(composerPayload(text, true), { text, mode: 'chat' });
  }
  assert.deepEqual(composerPayload('/goal Write a plan', false), { text: '/goal Write a plan', mode: 'chat' });
});

test('failed goal retries preserve prefix; deleting it in flight preserves the normal draft', () => {
  const submitted = { text: '/goal Write a plan', files: [] };
  assert.equal(settleSendDraft(submitted, submitted, 'receipt', true).text, submitted.text);
  assert.equal(settleSendDraft(submitted, submitted, 'receipt', true).sendId, 'receipt');
  const edited = { text: 'Write a plan', files: [] };
  for (const failed of [true, false]) {
    const result = settleSendDraft(edited, submitted, 'receipt', failed);
    assert.equal(result.text, edited.text);
    assert.equal(result.sendId, undefined);
    assert.equal(composerPayload(result.text, true).mode, 'chat');
  }
});

test('group goal receipts and their original requests stay visible', () => {
  const prompt: Message = { id: 'prompt', at: 1, role: 'user', kind: 'text', channelMode: 'goal', text: 'Write a plan' };
  const card: Message = { id: 'card', at: 2, role: 'bot', kind: 'goal.run', goalRun: { runId: 'run', goal: 'Write a plan', status: 'working', coordinatorBotId: 'bot', coordinatorName: 'Maus', turnCount: 1, maxTurns: 13, startedAt: 2 } };
  const chat: Message = { id: 'chat', at: 3, role: 'user', kind: 'text', text: 'Thanks' };
  const messages = [prompt, card, chat];
  for (const detail of ['off', 'summary', 'full'] as const) {
    assert.deepEqual(transcriptRows(messages, detail).map(message => message.id), ['card', 'chat']);
    assert.deepEqual(transcriptRows([prompt], detail), []);
  }
  assert.deepEqual(messages.map(message => message.id), ['prompt', 'card', 'chat']);
  for (const detail of ['off', 'summary', 'full'] as const) {
    assert.deepEqual(transcriptRows(messages, detail, true).map(message => message.id), ['prompt', 'card', 'chat']);
    assert.deepEqual(transcriptRows([prompt], detail, true), [prompt]);
  }
  assert.deepEqual(messages.map(message => message.id), ['prompt', 'card', 'chat']);
});

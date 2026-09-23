import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fold, hydrate, initialState, isTyping, visibleMessages } from '../src/core/store.ts';
import { transcriptRows } from '../src/core/transcript.ts';
import type { Fleet, Frame, Message } from '../src/core/types.ts';

const runtime = (event: Record<string, unknown>, threadId = 'thread'): Frame => ({
  kind: 'runtime', event: { eventId: 'event', provider: 'test', createdAt: '2026-09-22T00:00:00Z', threadId, turnId: 'turn', ...event },
}) as Frame;
const reply: Message = { id: 'reply', role: 'bot', kind: 'text', text: 'Finished reply', at: 2 };
const digest: Message = { id: 'digest', role: 'bot', kind: 'digest', text: 'Hidden work summary', at: 3, parentId: reply.id };
const message = (value: Message): Frame => ({ kind: 'message', threadId: 'thread', message: value });

test('a completed reply removes typing immediately, before hidden digest settlement releases busy', () => {
  let state = fold(initialState(), runtime({ type: 'turn.started' }));
  state = fold(state, runtime({ type: 'content.delta', streamKind: 'reasoning_text', delta: 'Thinking' }));
  state = fold(state, runtime({ type: 'content.delta', streamKind: 'assistant_text', delta: 'Partial reply' }));
  assert.equal(isTyping(state, 'thread', true), true);

  state = fold(state, message(reply));
  assert.equal(isTyping(state, 'thread', true), false, 'busy can remain true after the reply');
  assert.equal(state.streaming.thread, '');
  assert.equal(state.reasoning.thread, '', 'old reasoning must not leave a second loader');

  state = fold(state, runtime({ type: 'turn.completed', ok: true }));
  state = fold(state, message(digest));
  state = fold(state, { kind: 'message.patch', threadId: 'thread', message: { ...digest, text: 'Files added to hidden summary' } });
  assert.equal(isTyping(state, 'thread', true), false);
  for (const detail of ['off', 'summary', 'full'] as const) {
    assert.deepEqual(transcriptRows(visibleMessages(state.pages.thread), detail).map(m => m.id), ['reply']);
  }
});

test('fresh reply generation resumes typing, but old message patches do not change it', () => {
  let state = fold(initialState(), message(reply));
  state = fold(state, runtime({ type: 'content.delta', streamKind: 'assistant_text', delta: 'Another reply in this turn' }));
  assert.equal(isTyping(state, 'thread', true), true);
  state = fold(state, { kind: 'message.patch', threadId: 'thread', message: reply });
  state = fold(state, { kind: 'message.patch', threadId: 'thread', message: digest });
  assert.equal(isTyping(state, 'thread', true), true);
  assert.equal(state.streaming.thread, 'Another reply in this turn');
  state = fold(state, message({ ...reply, id: 'second-reply', at: 4 }));
  assert.equal(isTyping(state, 'thread', true), false);
  state = fold(state, runtime({ type: 'turn.started', turnId: 'next-turn' }));
  assert.equal(isTyping(state, 'thread', true), true, 'next turn can show dots before its first token');
  state = fold(state, runtime({ type: 'turn.completed', ok: true }, 'sibling'));
  assert.equal(isTyping(state, 'thread', true), true, 'sibling completion must not hide this reply');
});

test('completion without text and session exit stop typing while the server settles', () => {
  for (const end of [{ type: 'turn.completed', ok: false }, { type: 'session.exited', reason: 'closed' }]) {
    let state = fold(initialState(), runtime({ type: 'turn.started' }));
    state = fold(state, runtime({ type: 'content.delta', streamKind: 'reasoning_text', delta: 'Thinking' }));
    state = fold(state, runtime(end));
    assert.equal(isTyping(state, 'thread', true), false);
    assert.equal(state.reasoning.thread, '');
  }
});

test('snapshot recovery does not turn a saved reply or digest into another typing bubble', () => {
  const fleet: Fleet = { bots: [], groups: [] };
  const old = fold(initialState(), runtime({ type: 'turn.started' }));
  const screen: Message = { id: 'screen', role: 'bot', kind: 'screen', at: 4 };
  for (const messages of [[reply], [reply, digest], [reply, digest, screen]]) {
    const state = hydrate(old, fleet, { thread: { messages } });
    assert.equal(isTyping(state, 'thread', true), false);
  }
  const waiting = hydrate(old, fleet, { thread: { messages: [{ id: 'user', role: 'user', kind: 'text', text: 'New request', at: 1 }] } });
  assert.equal(isTyping(waiting, 'thread', true), true);
  assert.equal(isTyping(waiting, 'thread', false), false);
});

test('group turn completions and delayed digests cannot hide a newer speaker', () => {
  let state = fold(initialState(), runtime({ type: 'turn.started', turnId: 'a' }));
  state = fold(state, runtime({ type: 'turn.started', turnId: 'b' }));
  state = fold(state, message({ ...reply, turnId: 'a' }));
  assert.equal(isTyping(state, 'thread', true), true);
  state = fold(state, runtime({ type: 'turn.completed', turnId: 'a', ok: true }));
  state = fold(state, message({ ...digest, turnId: 'a' }));
  assert.equal(isTyping(state, 'thread', true), true);
  state = fold(state, runtime({ type: 'session.exited', turnId: 'a', reason: 'closed' }));
  assert.equal(isTyping(state, 'thread', true), true);
  state = fold(state, message({ ...reply, id: 'reply-b', turnId: 'b' }));
  assert.equal(isTyping(state, 'thread', true), false);
});


test('room selection shows dots through proposal and judge phases without public runtime events', () => {
  const card = (phase: NonNullable<NonNullable<Message['goalRun']>['election']>['phase'], status: NonNullable<Message['goalRun']>['status'] = 'working'): Message => ({
    id: 'discussion', role: 'bot', kind: 'goal.run', at: 1,
    goalRun: { runId: 'run', goal: 'Answer', status, coordinatorBotId: 'A', coordinatorName: 'Members', turnCount: 1, maxTurns: 10, startedAt: 1,
      election: { phase, rounds: [], sourceMessageId: 'user' } },
  });
  let state = fold(initialState(), message(card('proposing')));
  state = fold(state, message({ ...reply, parentId: 'discussion' }));
  assert.equal(state.typing.thread, false);
  for (const phase of ['proposing', 'voting', 'judging'] as const) {
    state = fold(state, { kind: 'message.patch', threadId: 'thread', message: card(phase) });
    assert.equal(isTyping(state, 'thread', true), true, phase);
    assert.equal(isTyping(state, 'thread', false), false);
  }
  for (const phase of ['completed', 'paused', 'stopped'] as const) {
    state = fold(state, { kind: 'message.patch', threadId: 'thread', message: card(phase, phase) });
    assert.equal(isTyping(state, 'thread', true), false, phase);
  }
});

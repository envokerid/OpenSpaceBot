import assert from 'node:assert/strict';
import test from 'node:test';
import { transcriptRows } from '../src/core/transcript.ts';
import type { Message } from '../src/core/types.ts';

test('sent and received notices stay visible at every tool detail level', () => {
 const tool: Message = { id: 'tool', at: 1, role: 'bot', kind: 'activity', tool: { name: 'Bash', ok: true } };
 const sent: Message = { ...tool, id: 'sent', tool: { name: 'Sent to Helper', ok: true }, threadRef: { botId: 'helper', threadId: 'helper-thread', title: 'Main' } };
 const received: Message = { ...tool, id: 'received', tool: { name: 'Received message from @Helper', ok: true }, comm: { groupId: 'pair', withBotId: 'helper', withName: 'Helper', withColor: 'blue' } };
 const messages = [tool, sent, { ...tool, id: 'next-tool' }, received];
 assert.deepEqual(transcriptRows(messages, 'off'), [sent, received]);
 const summary = transcriptRows(messages, 'summary');
 assert.deepEqual(summary.map(row => row.id), ['run.tool', 'sent', 'run.next-tool', 'received']);
 assert.equal(summary[1], sent);
 assert.equal(summary[3], received);
 assert.deepEqual(transcriptRows(messages, 'full'), messages);
});


test('avatar-only chat hides live, settled and failed tools while keeping approvals and turn errors', () => {
 const tool: Message = { id: 'live', at: 1, role: 'bot', kind: 'activity', tool: { name: 'Bash' } };
 const approval: Message = { id: 'approval', at: 2, role: 'bot', kind: 'options', card: { title: 'Allow this action?', options: ['Allow', 'Deny'], tool: 'Bash' } };
 const error: Message = { ...tool, id: 'error', tool: { name: 'error: Connection lost', ok: false } };
 const reply: Message = { id: 'reply', at: 3, role: 'bot', kind: 'text', text: 'Finished.' };
 const messages = [tool, { ...tool, id: 'done', tool: { name: 'Bash', ok: true } }, { ...tool, id: 'failed', tool: { name: 'Bash', ok: false } }, approval, error, reply];
 assert.deepEqual(transcriptRows(messages, 'off'), [approval, error, reply]);
});

test('a reply image replaces only its redundant standalone screen preview', () => {
 const reply: Message = { id: 'reply', at: 1, role: 'bot', kind: 'text', turnId: 'turn', attachments: [{ kind: 'image', path: '/api/attachments/screenshot.png', mime: 'image/png' }] };
 const digest: Message = { id: 'digest', at: 2, role: 'bot', kind: 'digest', turnId: 'turn' };
 const screen: Message = { id: 'screen', at: 3, role: 'bot', kind: 'screen' };
 for (const detail of ['off', 'summary', 'full'] as const) {
  assert.deepEqual(transcriptRows([reply, digest, screen], detail), [reply]);
  const textOnly = { ...reply, attachments: [] };
  assert.deepEqual(transcriptRows([textOnly, digest, screen], detail), [textOnly, screen]);
 }
});


test('incoming peer requests reuse their sender receipt while outgoing receipts and replies stay visible', () => {
 const incoming: Message = { id: 'received', at: 1, role: 'bot', kind: 'activity', tool: { name: 'Message from @Chief' }, comm: { groupId: 'pair', withBotId: 'chief', withName: 'Chief', withColor: 'blue' } };
 const request: Message = { id: 'peer', at: 2, role: 'user', kind: 'text', text: 'Internal instructions', peerAsk: { botId: 'chief', name: 'Chief' } };
 const outgoing: Message = { ...incoming, id: 'sent', tool: { name: 'Messaged @Chief' } };
 const reply: Message = { id: 'reply', at: 3, role: 'bot', kind: 'text', text: 'Done.' };
 assert.deepEqual(transcriptRows([incoming, request, reply], 'off'), [incoming, reply]);
 assert.deepEqual(transcriptRows([outgoing, request, reply], 'off'), [outgoing, request, reply]);
 assert.deepEqual(transcriptRows([request, reply], 'off'), [request, reply], 'requests without an existing receipt remain available for the sender-notice renderer');
});

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

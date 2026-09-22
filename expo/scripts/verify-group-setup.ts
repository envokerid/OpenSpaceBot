import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Client } from '../src/core/client.ts';
import type { Group } from '../src/core/types.ts';
import { groupNeedsSetup } from '../src/core/groups.ts';

/** Runs only against verify-server's disposable server and companion proxy. */
export async function verifyGroupSetup(client: Client, botIds: string[], control: (args: string[]) => Promise<{ state?: string; status?: string }>) {
  const outcomes: unknown[] = [];
  const sendAndVerify = async (group: Group, text: string) => {
    const sendId = randomUUID();
    await client.send({ kind: 'groups', id: group.id, threadId: group.threadId }, text, sendId);
    const result = await control(['wait', '--channel', group.id, '--timeout', '30']);
    assert.equal(result.state ?? result.status, 'settled');
    const page = await client.page(group.threadId);
    assert.equal(page.messages.filter(message => message.sendId === sendId && message.role === 'user').length, 1);
    assert.ok(page.messages.some(message => message.role === 'bot' && message.kind === 'text'));
    await control(['messages', '--channel', group.id, '--limit', '10']);
    outcomes.push({ groupId: group.id, threadId: group.threadId, sendId, text, status: 'settled' });
  };
  const created = await client.createGroup('Ready mobile group', botIds);
  assert.ok(created.group.setupCompletedAt);
  assert.equal(groupNeedsSetup(created.group), false);
  assert.deepEqual(created.group.defaultResponder, { kind: 'member', botId: botIds[0] });
  await sendAndVerify(created.group, 'First message from the new Expo group');

  // Reproduce groups made by the old Expo flow, then recover the same group.
  const { group: pending } = await client.request<{ group: Group }>('/api/groups', 'POST', { name: 'Unfinished mobile group', memberIds: botIds });
  assert.equal(groupNeedsSetup(pending), true);
  await assert.rejects(() => client.send({ kind: 'groups', id: pending.id, threadId: pending.threadId }, 'Blocked before setup', randomUUID()), /finish room setup/i);
  assert.equal((await client.page(pending.threadId)).messages.length, 0);
  const { group: recovered } = await client.startGroupChat(pending.id);
  assert.equal(recovered.id, pending.id);
  assert.equal(recovered.threadId, pending.threadId);
  assert.ok(recovered.setupSkippedAt);
  assert.equal(groupNeedsSetup(recovered), false);
  assert.deepEqual(recovered.memberIds, pending.memberIds);
  assert.deepEqual(recovered.defaultResponder, pending.defaultResponder);
  assert.equal(recovered.bulletin, pending.bulletin);
  assert.equal(recovered.cwd, pending.cwd);
  assert.equal((await client.startGroupChat(pending.id)).group.setupSkippedAt, recovered.setupSkippedAt);
  assert.equal(groupNeedsSetup((await client.fleet()).groups.find(group => group.id === pending.id)!), false);
  await sendAndVerify(recovered, 'First message after finishing Expo group setup');
  return { action: 'create ready group and recover unfinished group through companion; first sends settle', outcomes, status: 'passed' };
}

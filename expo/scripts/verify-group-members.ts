import assert from 'node:assert/strict';
import type { Client } from '../src/core/client.ts';
import type { Session } from '../src/core/session.ts';
import type { Bot, Group } from '../src/core/types.ts';

/** Runs through the companion proxy inside verify-server's owned fixture. */
export async function verifyGroupMembers(client: Client, session: Session, botId: string) {
  const { bot } = await client.request<{ bot: Bot }>('/api/bots', 'POST', { name: 'New group member' });
  const { group } = await client.request<{ group: Group }>('/api/groups', 'POST', {
    name: 'Membership fixture', memberIds: [botId],
  });
  const before = await client.page(group.threadId);
  const result = await client.groupMembers(group.id, [botId, bot.id, bot.id], [botId]);
  assert.deepEqual(result.group.memberIds, [botId, bot.id]);
  assert.equal(result.group.threadId, group.threadId);
  assert.deepEqual(await client.page(group.threadId), before);
  const deadline = Date.now() + 10_000;
  while (!session.state.groups.find(g => g.id === group.id)?.memberIds.includes(bot.id)) {
    assert.ok(Date.now() < deadline, 'Membership update must reach the mobile stream');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await assert.rejects(() => client.groupMembers(group.id, [bot.id], [botId]), /members changed/i);
  await assert.rejects(() => client.groupMembers(group.id, [], [botId, bot.id]), /provide memberIds/i);
  await assert.rejects(() => client.groupMembers(group.id, ['missing-bot'], [botId, bot.id]), /unknown room member/i);
  await assert.rejects(() => client.request(`/api/groups/${group.id}/members`, 'PATCH', {
    memberIds: [botId], expectedMemberIds: [botId, bot.id], cwd: '/tmp',
  }), /provide memberIds/i);
  await assert.rejects(() => client.request(`/api/groups/${group.id}`, 'PATCH', { memberIds: [botId] }), /no route/i);
  const bulletin = 'Research together.\nCite sources and keep replies concise. ✓';
  const saved = await client.groupMembers(group.id, [bot.id], [botId, bot.id], { bulletin, expectedBulletin: '' });
  assert.equal(saved.group.bulletin, bulletin);
  assert.deepEqual(saved.group.memberIds, [bot.id]);
  const instructionDeadline = Date.now() + 10_000;
  while (session.state.groups.find(g => g.id === group.id)?.bulletin !== bulletin) {
    assert.ok(Date.now() < instructionDeadline, 'Group instructions must reach the mobile stream');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  // Neither field changes when the opened instructions are stale.
  await assert.rejects(() => client.groupMembers(group.id, [botId], [bot.id], { bulletin: 'Stale edit', expectedBulletin: '' }), /instructions changed/i);
  for (const invalid of [
    { bulletin: 'Missing comparison' },
    { expectedBulletin: bulletin },
    { bulletin: 'x'.repeat(12_001), expectedBulletin: bulletin },
  ]) {
    await assert.rejects(() => client.request(`/api/groups/${group.id}/members`, 'PATCH', {
      memberIds: [botId], expectedMemberIds: [bot.id], ...invalid,
    }), /provide memberIds/i);
  }
  const unchanged = (await client.fleet()).groups.find(g => g.id === group.id)!;
  assert.deepEqual(unchanged.memberIds, [bot.id]);
  assert.equal(unchanged.bulletin, bulletin);
  // Older clients can still change membership without clearing instructions.
  await client.groupMembers(group.id, [botId, bot.id], [bot.id]);
  assert.equal((await client.fleet()).groups.find(g => g.id === group.id)!.bulletin, bulletin);
  const edited = await client.groupMembers(group.id, [botId, bot.id], [botId, bot.id], { bulletin: 'Updated instructions', expectedBulletin: bulletin });
  assert.equal(edited.group.bulletin, 'Updated instructions');
  const cleared = await client.groupMembers(group.id, [botId, bot.id], [botId, bot.id], { bulletin: '', expectedBulletin: 'Updated instructions' });
  assert.equal(cleared.group.bulletin, '');
  assert.deepEqual(await client.page(group.threadId), before);
  await session.refresh();
  assert.deepEqual(session.state.groups.find(g => g.id === group.id)!.memberIds, [botId, bot.id]);
  assert.equal(session.state.groups.find(g => g.id === group.id)!.bulletin, '');
  return { action: 'edit members and add/edit/clear group instructions atomically through companion; SSE, reload, old-client compatibility, stale/malformed/oversized rejection', groupId: group.id, memberIds: result.group.memberIds, status: 'passed' };
}

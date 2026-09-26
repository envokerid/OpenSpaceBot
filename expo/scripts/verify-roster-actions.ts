import assert from 'node:assert/strict';
import type { Client } from '../src/core/client.ts';
import type { Session } from '../src/core/session.ts';
import type { Bot } from '../src/core/types.ts';

/** Uses only verify-server's disposable workspace and authenticated proxy. */
export async function verifyRosterActions(client: Client, session: Session) {
  const before = (await client.fleet()).bots.map(bot => bot.id).sort();
  const { bot } = await client.request<{ bot: Bot }>('/api/bots', 'POST', { name: 'Roster actions probe' });
  const original = await client.page(bot.threadId);
  await assert.rejects(async () => client.renameBot(bot.id, '   '), /bot name/i);
  await client.renameBot(bot.id, '  Renamed roster probe  ');
  await session.refresh();
  const renamed = session.snapshot().bots.find(candidate => candidate.id === bot.id)!;
  assert.equal(renamed.name, 'Renamed roster probe');
  assert.equal(renamed.threadId, bot.threadId);
  assert.deepEqual(await client.page(bot.threadId), original);
  // The full editor keeps using the existing mobile profile endpoint.
  await client.request(`/api/bots/${bot.id}/profile`, 'PATCH', { title: 'Edited from roster' });
  assert.equal((await client.fleet()).bots.find(candidate => candidate.id === bot.id)!.title, 'Edited from roster');
  const peerSections = (await client.fleet()).bots.filter(candidate => candidate.id !== bot.id).map(candidate => ({ id: candidate.id, section: candidate.section }));
  await client.request('/api/sidebar-sections', 'POST', { name: 'Empty roster section', botIds: [] });
  for (const section of ['  New roster section  ', 'Empty roster section', '']) {
    await client.moveBotToSection(bot.id, section);
    await session.refresh();
    const moved = session.snapshot().bots.find(candidate => candidate.id === bot.id)!;
    assert.equal(moved.section ?? '', section.trim());
    assert.equal(moved.name, renamed.name);
    assert.equal(moved.threadId, bot.threadId);
    assert.deepEqual(await client.page(bot.threadId), original);
    assert.deepEqual(session.snapshot().bots.filter(candidate => candidate.id !== bot.id).map(candidate => ({ id: candidate.id, section: candidate.section })), peerSections);
  }
  assert.ok(session.snapshot().sections.includes('New roster section'));
  assert.ok(session.snapshot().sections.includes('Empty roster section'));
  await client.deleteBot(bot.id);
  await session.refresh();
  assert.deepEqual(session.snapshot().bots.map(bot => bot.id).sort(), before);
  await assert.rejects(() => client.page(bot.threadId), /not found|no such|unknown/i);
  const groupsBefore = (await client.fleet()).groups.map(group => group.id).sort();
  const { group } = await client.createGroup('Delete from home probe', before.slice(0, 2));
  await session.refresh();
  assert.ok(session.snapshot().groups.some(candidate => candidate.id === group.id));
  await client.deleteGroup(group.id);
  await session.refresh();
  assert.deepEqual(session.snapshot().groups.map(candidate => candidate.id).sort(), groupsBefore);
  assert.deepEqual(session.snapshot().bots.map(candidate => candidate.id).sort(), before);
  await assert.rejects(() => client.page(group.threadId), /not found|no such|unknown/i);
  return { action: 'rename, profile edit, move bot to a new section, an existing empty section and no section, then delete selected bot; delete selected group through companion and preserve other groups and member bots', botId: bot.id, groupId: group.id, sectionMoves: ['New roster section', 'Empty roster section', ''], status: 'passed' };
}

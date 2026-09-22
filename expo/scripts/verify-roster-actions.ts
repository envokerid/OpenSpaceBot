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
  await client.deleteBot(bot.id);
  await session.refresh();
  assert.deepEqual(session.snapshot().bots.map(bot => bot.id).sort(), before);
  await assert.rejects(() => client.page(bot.threadId), /not found|no such|unknown/i);
  return { action: 'rename, profile edit and delete selected bot through companion; preserve transcript on rename and preserve other bots on delete', botId: bot.id, status: 'passed' };
}

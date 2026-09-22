import assert from 'node:assert/strict';
import type { Client } from '../src/core/client.ts';
import type { Session } from '../src/core/session.ts';

/** Runs only inside verify-server's owned fixture, through the real proxy. */
export async function verifyPermissions(client: Client, session: Session, botId: string) {
  const before = (await client.fleet()).bots.find(b => b.id === botId)!;
  const sibling = await client.request<{ bot: { id: string } }>('/api/bots', 'POST', { name: 'Permissions handover' });
  const otherId = sibling.bot.id;
  const team = 'Expo permission team';
  await client.request('/api/sidebar-sections', 'POST', { name: team });
  await client.permissions(otherId, { chiefOfStaff: true });
  await client.permissions(botId, { chiefOfStaff: true, approvePeerComms: true });
  let fleet = await client.fleet();
  assert.equal(fleet.bots.find(b => b.id === botId)!.chiefOfStaff, true);
  assert.equal(fleet.bots.find(b => b.id === otherId)!.chiefOfStaff, false);
  assert.equal(fleet.bots.find(b => b.id === botId)!.approvePeerComms, true);
  await assert.rejects(() => client.permissions(botId, { managedSections: [team] }), /confirm/i);
  await client.permissions(botId, { managedSections: [team], acknowledgePeerScope: true });
  assert.deepEqual((await client.fleet()).bots.find(b => b.id === botId)!.managedSections, [team]);
  await client.permissions(botId, { approvalMode: 'edits' });
  fleet = await client.fleet();
  assert.equal(fleet.bots.find(b => b.id === botId)!.approvalMode, 'edits');
  assert.deepEqual(fleet.bots.find(b => b.id === botId)!.tasks?.map(t => [t.threadId, t.approvalMode]), before.tasks?.map(t => [t.threadId, t.approvalMode]));
  const created = await client.createTask({ kind: 'bots', id: botId, threadId: before.threadId }, 'Permission default');
  assert.equal(created.bot!.tasks!.find(t => t.threadId === created.bot!.threadId)!.approvalMode, 'edits');
  await client.task({ kind: 'bots', id: botId, threadId: before.threadId }, 'POST');
  for (const body of [{ approvalMode: 'full', confirmFullAccess: true }, { approvalMode: 'custom' }, { computer: 'local' }, { alwaysAllow: ['Bash'] }, { chiefOfStaff: 'yes' }, { managedSections: [123] }]) {
    await assert.rejects(() => client.request(`/api/bots/${botId}/permissions`, 'PATCH', body), /invalid|unsupported/i);
  }
  await client.permissions(botId, { chiefOfStaff: false, approvePeerComms: false, approvalMode: 'ask' });
  await session.refresh();
  const after = session.state.bots.find(b => b.id === botId)!;
  assert.equal(after.chiefOfStaff, false);
  assert.equal(after.approvePeerComms, false);
  assert.deepEqual(after.managedSections, []);
  assert.equal(after.approvalMode, 'ask');
  assert.ok(session.state.sections.includes(team));
  return { action: 'bot permissions: Chief handover, team grant acknowledgement/revocation, peer approval, approval default inheritance, unchanged existing threads, rejected elevated/unrelated writes', status: 'passed', botId, state: { chiefOfStaff: after.chiefOfStaff, managedSections: after.managedSections, approvePeerComms: after.approvePeerComms, approvalMode: after.approvalMode } };
}

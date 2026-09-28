// Drives the actual wire signals through the documented isolated control
// surface. No renderer, browser, real provider, or live user workspace.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { launchVerificationServer, runControlOmb } from '../control-omb.ts';
import { request } from '../mcp-server.ts';
import { createMascotTriggers } from '../../shared/mascot-triggers.ts';
import { liveStateForBot, type MascotBotProfile, type MascotMessage } from '../../shared/mascot-state.ts';

it('drives reply, teammate-wait, and completion mascot triggers from an isolated conversation', async () => {
  const session = await launchVerificationServer(process.env, undefined, undefined, undefined, undefined, { scripted: true });
  const evidence: unknown[] = [{ fixture: session.info }];
  const control = async (...args: string[]) => {
    const result = await runControlOmb([...args, '--url', session.info.url]);
    evidence.push({ command: [...args, '--url', session.info.url], result });
    return result as { bot: { id: string; activeTaskId: string }; status?: string };
  };
  const api = (path: string) => request(path, {}, session.info.url);
  try {
    const lead = (await control('new-bot', '--name', 'Maus Lead')).bot;
    const peer = (await control('new-bot', '--name', 'Maus Reviewer')).bot;
    const gate = join(session.info.dataDir, 'mascot-peer-ready');
    writeFileSync(join(session.info.dataDir, 'room-plan.json'), JSON.stringify({
      [lead.id]: { steps: [{ arguments: { bot_ids: [peer.id], request_key: 'mascot-review', message: 'Review the fixture result' } }], reply: 'Waiting for the review', resumeReply: 'The review is complete' },
      [peer.id]: { gateFile: gate, reply: 'Fixture reviewed' },
    }));
    const snapshot = async (): Promise<MascotBotProfile> => {
      const fleet = await api('/api/bots?messages=0') as { bots: MascotBotProfile[] };
      const page = await api(`/api/threads/${lead.activeTaskId}/messages`) as { messages: MascotMessage[] };
      return { ...fleet.bots.find(bot => bot.id === lead.id)!, threadId: lead.activeTaskId, messages: page.messages };
    };
    const controller = createMascotTriggers();
    controller.update(await snapshot(), Date.now());
    await control('send', '--bot', lead.id, '--task', lead.activeTaskId, '--text', 'Please ask the reviewer and report back.');
    // The fast fake source can already be waiting by the first read. The new
    // human reply must either greet, or correctly yield to that live wait.
    const sent = await snapshot();
    const greeting = controller.update(sent, Date.now());
    expect(greeting?.trigger === 'user-reply' || liveStateForBot(sent) === 'orbit').toBe(true);
    await expect.poll(async () => liveStateForBot(await snapshot()), { timeout: 30_000 }).toBe('orbit');
    const waiting = await snapshot();
    expect(waiting.busy).toBe(false);
    expect(waiting.waitingForTeammates).toBe(true);
    expect(controller.update(waiting, Date.now())).toBeNull();
    evidence.push({ phase: 'waiting', state: liveStateForBot(waiting), busy: waiting.busy, waitingForTeammates: waiting.waitingForTeammates });
    writeFileSync(gate, 'Release only this fixture reviewer');
    expect((await control('wait', '--bot', lead.id, '--task', lead.activeTaskId, '--timeout', '30')).status).toBe('settled');
    const finished = await snapshot();
    expect(finished.waitingForTeammates).toBeFalsy();
    expect(liveStateForBot(finished)).not.toBe('orbit');
    const reaction = controller.update(finished, Date.now());
    expect(['teammate-reply', 'reply-complete']).toContain(reaction?.trigger);
    expect(controller.update(finished, Date.now() + 3000)).toBeNull();
    evidence.push({ phase: 'finished', reaction });
    await control('messages', '--bot', lead.id, '--task', lead.activeTaskId, '--limit', '12');
  } finally {
    const evidencePath = `${session.info.logPath}.mascot.json`;
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.info(JSON.stringify({ evidencePath, logPath: session.info.logPath }));
    await session.close();
  }
}, 90_000);

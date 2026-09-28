import { describe, expect, it } from 'vitest';
import { createMascotTriggers } from './mascot-triggers';
import { liveStateForBot, type MascotBotProfile, type MascotMessage } from './mascot-state';

const bot: MascotBotProfile = { id: 'maus', threadId: 'main', name: 'Maus', messages: [] };
const message = (id: string, at: number, extra: Partial<MascotMessage> = {}): MascotMessage => ({ id, at, role: 'user', kind: 'text', ...extra });

describe('live situation selection', () => {
  it('distinguishes typing, reasoning, real dependency waits and approval waits', () => {
    expect(liveStateForBot({ ...bot, busy: true, typing: true })).toBe('writing');
    expect(liveStateForBot({ ...bot, busy: true, reasoning: true })).toBe('thinking');
    expect(liveStateForBot({ ...bot, busy: false, waitingForTeammates: true })).toBe('orbit');
    expect(liveStateForBot({ ...bot, waitingForTeammates: true, activity: 'waiting-on-you' })).toBe('listening');
    expect(liveStateForBot({ ...bot, typing: true, activity: 'dead' })).toBe('alerting');
    expect(liveStateForBot({ ...bot, busy: true, messages: [message('s', 1, { kind: 'activity', tool: { name: 'web_search' } })] })).toBe('searching');
  });
});

describe('automatic mascot reactions', () => {
  it('bounces once for a new user reply, then expires without further events', () => {
    const controller = createMascotTriggers();
    expect(controller.update(bot, 1000)).toBeNull();
    const live = { ...bot, busy: true, messages: [message('u', 1010)] };
    const reaction = controller.update(live, 1020);
    expect(reaction?.trigger).toBe('user-reply');
    expect(controller.update(live, 1500)?.until).toBe(reaction?.until);
    expect(controller.update(live, 3000)).toBeNull();
  });
  it('does not greet loaded history, prepended pages, switched branches or another thread', () => {
    const controller = createMascotTriggers();
    const initial = { ...bot, messages: [message('old', 900)] };
    expect(controller.update(initial, 1000)).toBeNull();
    expect(controller.update({ ...initial, messages: [message('older', 500), ...initial.messages] }, 1100)).toBeNull();
    expect(controller.update({ ...bot, messages: [message('branch', 1150)] }, 1200)).toBeNull();
    expect(controller.update({ ...bot, threadId: 'other', messages: [message('other', 1250)] }, 1300)).toBeNull();
  });
  it('ignores queued messages and old snapshots arriving after an empty hydration', () => {
    const controller = createMascotTriggers(); controller.update(bot, 1000);
    expect(controller.update({ ...bot, messages: [message('history', 999)] }, 1100)).toBeNull();
    expect(controller.update({ ...bot, messages: [message('history', 999), message('queue', 1200, { queued: true })] }, 1200)).toBeNull();
  });
  it('acknowledges teammates separately and gives live status priority', () => {
    const controller = createMascotTriggers(); controller.update(bot, 1000);
    const live = { ...bot, messages: [message('peer', 1010, { peerAsk: { botId: 'reviewer' } })] };
    expect(controller.update(live, 1020)?.trigger).toBe('teammate-reply');
    expect(controller.update({ ...live, waitingForTeammates: true }, 1030)).toBeNull();
    expect(controller.update({ ...live, typing: true }, 1040)).toBeNull();
  });
  it('celebrates terminal replies once, including a terminal patch on the same row', () => {
    const controller = createMascotTriggers(); controller.update(bot, 1000);
    const busy = { ...bot, busy: true, messages: [message('text', 1010, { role: 'bot' })] };
    expect(controller.update(busy, 1020)).toBeNull();
    const complete = { ...busy, messages: [message('text', 1010, { role: 'bot', turnTerminal: true })] };
    const reaction = controller.update(complete, 1100);
    expect(reaction?.trigger).toBe('reply-complete');
    expect(controller.update({ ...complete, busy: false }, 1200)?.until).toBe(reaction?.until);
    expect(controller.update({ ...complete, busy: false }, 3000)).toBeNull();
  });
  it('does not let approval or failure get masked by enthusiasm, and resumes without replay', () => {
    const controller = createMascotTriggers(); controller.update(bot, 1000);
    const live = { ...bot, messages: [message('u', 1010)] };
    expect(controller.update(live, 1020)?.state).toBe('excited');
    expect(controller.update({ ...live, activity: 'waiting-on-you' }, 1050)).toBeNull();
    expect(controller.update(live, 1100, false)).toBeNull();
    expect(controller.update(live, 1200)).toBeNull();
    expect(controller.update({ ...live, messages: [...live.messages, message('err', 1300, { kind: 'activity', tool: { ok: false } })] }, 1300)).toBeNull();
  });
});

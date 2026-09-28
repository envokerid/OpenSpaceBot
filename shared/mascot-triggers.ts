import type { MascotState } from './mascot-appearance.ts';
import { liveStateForBot, type MascotBotProfile, type MascotMessage } from './mascot-state.ts';

// Finite reactions overlay continuous activity, then hand control back to it.
export const MASCOT_TRIGGERS = {
  'user-reply': { state: 'excited', duration: 1800 },
  'teammate-reply': { state: 'receiving', duration: 1200 },
  'reply-complete': { state: 'celebrate', duration: 1800 },
} satisfies Record<string, { state: MascotState; duration: number }>;
/** Manual previews use the very same states as live triggers. */
export const MASCOT_SCENARIOS = [
  { label: 'Typing', state: 'writing' },
  { label: 'Waiting for teammate', state: 'orbit' },
  { label: 'Your reply', state: 'excited' },
  { label: 'Teammate replied', state: 'receiving' },
  { label: 'Finished', state: 'celebrate' },
  { label: 'Waiting for you', state: 'listening' },
] satisfies { label: string; state: MascotState }[];
export type MascotTrigger = keyof typeof MASCOT_TRIGGERS;
export interface MascotReaction { trigger: MascotTrigger; state: MascotState; until: number }
const relevant = (message: MascotMessage) => message.kind !== 'digest' && message.kind !== 'compaction';

/** One controller per mounted avatar/thread. No replay on hydration or history
 * changes, no text/keyword guessing, and no mutation of conversation state. */
export function createMascotTriggers() {
  let key: string | undefined;
  let baselineAt = 0;
  let tail: string | undefined;
  let seen = new Set<string>();
  let terminal = new Set<string>();
  let reaction: MascotReaction | null = null;
  let previousBusy = false;
  let lastCompleted: string | undefined;
  return {
    update(bot: MascotBotProfile, now: number, enabled = true): MascotReaction | null {
      const nextKey = `${bot.id ?? bot.name}:${bot.threadId ?? ''}`;
      const messages = bot.messages?.slice(-128).filter(relevant) ?? [];
      const ids = new Set(messages.flatMap(message => message.id ? [message.id] : []));
      const busy = !!bot.busy || bot.activity === 'working';
      const reset = key !== nextKey || !enabled || (tail !== undefined && !ids.has(tail));
      if (reset) {
        key = nextKey; baselineAt = now; seen = ids;
        terminal = new Set(messages.filter(m => m.turnTerminal).flatMap(m => m.id ? [m.id] : []));
        reaction = null; lastCompleted = undefined;
      } else {
        const fresh = (m: MascotMessage) => m.at !== undefined && m.at >= baselineAt && now - m.at < 10_000 && m.at <= now + 2000;
        const incoming = messages.findLast(m => m.id && !seen.has(m.id) && fresh(m) && m.role === 'user' && !m.queued);
        const completed = messages.findLast(m => m.id && m.role === 'bot' && m.kind === 'text' && fresh(m)
          && (m.turnTerminal || !busy) && (!seen.has(m.id) || (m.turnTerminal && !terminal.has(m.id)) || (previousBusy && !busy)));
        let trigger: MascotTrigger | undefined;
        if (incoming) trigger = incoming.peerAsk || incoming.from ? 'teammate-reply' : 'user-reply';
        else if (completed && completed.id !== lastCompleted) { trigger = 'reply-complete'; lastCompleted = completed.id; }
        if (trigger) reaction = { trigger, ...MASCOT_TRIGGERS[trigger], until: now + MASCOT_TRIGGERS[trigger].duration };
        // Retain only the bounded transcript's identities, not an unbounded log.
        seen = ids;
        terminal = new Set(messages.filter(m => m.turnTerminal).flatMap(m => m.id ? [m.id] : []));
      }
      previousBusy = busy;
      tail = messages.at(-1)?.id;
      const live = liveStateForBot(bot);
      // Never hide an approval, failure, actual streaming, or a dependency wait.
      if (reaction && (now >= reaction.until || ['alerting', 'listening', 'orbit', 'writing'].includes(live ?? ''))) reaction = null;
      return reaction;
    },
  };
}

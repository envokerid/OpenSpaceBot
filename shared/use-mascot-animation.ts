import { useEffect, useRef, useState } from 'react';
import type { MascotState } from './mascot-appearance.ts';
import { liveStateForBot, type MascotBotProfile } from './mascot-state.ts';
import { createMascotTriggers, type MascotReaction } from './mascot-triggers.ts';

/** Desktop and Expo share timing/priority. Timers expire without another SSE
 * frame; unmount, disabled animation and thread switches cancel old reactions. */
export function useMascotAnimation(bot: MascotBotProfile, fallback: MascotState, enabled = true): MascotState {
  const controller = useRef<ReturnType<typeof createMascotTriggers> | null>(null);
  if (!controller.current) controller.current = createMascotTriggers();
  const key = `${bot.id ?? bot.name}:${bot.threadId ?? ''}`;
  const [beat, setBeat] = useState<{ key: string; reaction: MascotReaction } | null>(null);
  const latest = useRef(bot); latest.current = bot;
  useEffect(() => {
    const reaction = controller.current!.update(latest.current, Date.now(), enabled);
    setBeat(reaction ? { key, reaction } : null);
    if (!reaction) return;
    const timer = setTimeout(() => {
      controller.current!.update(latest.current, Date.now(), enabled);
      setBeat(null);
    }, Math.max(0, reaction.until - Date.now()));
    return () => clearTimeout(timer);
  }, [key, enabled, bot.messages, bot.busy, bot.activity, bot.waitingForTeammates, bot.typing, bot.reasoning]);
  if (!enabled) return fallback;
  const live = liveStateForBot(bot);
  if (live && ['alerting', 'listening', 'orbit', 'writing'].includes(live)) return live;
  return (beat?.key === key && beat.reaction.until > Date.now() ? beat.reaction.state : null) ?? live ?? fallback;
}

import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import type { MascotState } from '../../shared/mascot-appearance';
import { createAvatarAnimation, restingAvatarFrame } from './core/avatarAnimation';
import { subscribeMascotFrames } from '../../shared/mascot-frames';

export function useAvatarMotion(state: MascotState, animated: boolean) {
  const resting = useMemo(() => restingAvatarFrame(state), [state]);
  const [current, setCurrent] = useState(() => ({ state, frame: resting }));
  useEffect(() => {
    if (!animated) return;
    let disposed = false, reduced = true, active = AppState.currentState === 'active';
    let unsubscribe: (() => void) | undefined;
    const restart = () => {
      unsubscribe?.(); unsubscribe = undefined;
      setCurrent({ state, frame: resting });
      if (disposed || reduced || !active) return;
      const step = createAvatarAnimation(state, Date.now());
      unsubscribe = subscribeMascotFrames(() => setCurrent({ state, frame: step(Date.now()) }));
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (!disposed) { reduced = value; restart(); } }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduced = value; restart(); });
    const lifecycle = AppState.addEventListener('change', value => { active = value === 'active'; restart(); });
    restart();
    return () => { disposed = true; unsubscribe?.(); motion.remove(); lifecycle.remove(); };
  }, [state, animated, resting]);
  return !animated || current.state !== state ? resting : current.frame;
}

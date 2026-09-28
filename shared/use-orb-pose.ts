import { useEffect, useState } from 'react';
import type { MascotState } from './mascot-appearance';
import { orbPose } from './orb-mascot';
import { subscribeMascotFrames } from './mascot-frames';

export function useOrbPose(state: MascotState, animated: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (animated) return subscribeMascotFrames(setSeconds);
  }, [animated]);
  return orbPose(state, seconds, animated);
}

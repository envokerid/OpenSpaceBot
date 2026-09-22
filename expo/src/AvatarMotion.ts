import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { EXPRESSIONS, GAZE, MOUTHS, type Ring } from '../../src/components/cursor-face-data';

// The native MausFaceEngine's companion states: expression pools, spring,
// blink cadence and body motion. List thumbnails retain their resting pose.
const states = {
 idle: { pool: [6,0,8], cadence: [9000,16000], blink: [6000,14000], bob: 0, period: 3600, pulse: .014, squash: 0 },
 listening: { pool: [1,10,19], cadence: [2800,5000], blink: [3000,7000], bob: 2, period: 2600, pulse: .012, squash: 0 },
 working: { pool: [10,7,16,11], cadence: [1800,3200], blink: [2800,5500], bob: 2.5, period: 900, pulse: 0, squash: .22 },
 happy: { pool: [19,2,11,17], cadence: [2500,4500], blink: [2500,5000], bob: 5, period: 820, pulse: 0, squash: .28 },
};
const rings = (expression: number): Ring[] => EXPRESSIONS[expression].map(ring => ring.map(([x,y]) => [x + GAZE[expression][0]*.35,y + GAZE[expression][1]*.35]));
const rest = (state: keyof typeof states) => ({ eyes: rings(states[state].pool[0]), mouth: MOUTHS[states[state].pool[0]], blink: 1, transform: '' });
export function useAvatarMotion(state: keyof typeof states, animated: boolean) {
 const [frame,setFrame] = useState(() => rest(state));
 useEffect(() => {
  let disposed = false, reduced = true, active = AppState.currentState === 'active'; let timer: ReturnType<typeof setInterval> | undefined;
  const restart = () => {
   clearInterval(timer); setFrame(rest(state)); if (disposed || !animated || reduced || !active) return;
   const spec = states[state]; const start = Date.now(); let last = start, index = spec.pool[0], eyes = rings(index), mouth = [...MOUTHS[index]], from = eyes, fromMouth = mouth, target = eyes, targetMouth = mouth, blend = 1, velocity = 0;
   const delay = (range: number[]) => range[0] + Math.random()*(range[1]-range[0]);
   let nextExpression = start + delay(spec.cadence), nextBlink = start + delay(spec.blink), blinkAt = -Infinity;
   timer = setInterval(() => {
    const now = Date.now(), elapsed = now-start, dt = Math.min(.1,(now-last)/1000); last = now;
    if (now >= nextExpression) { const options = spec.pool.filter(i => i !== index); index = options[Math.floor(Math.random()*options.length)]; from = eyes; fromMouth = mouth; target = rings(index); targetMouth = MOUTHS[index]; blend = 0; velocity = 0; nextExpression = now + delay(spec.cadence); }
    velocity += (-14*velocity-49*(blend-1))*dt; blend += velocity*dt; const m = Math.max(0,Math.min(1,blend));
    eyes = from.map((ring,i) => ring.map(([x,y],j) => [x+(target[i][j][0]-x)*m,y+(target[i][j][1]-y)*m])); mouth = fromMouth.map((v,i) => v+(targetMouth[i]-v)*m);
    if (now >= nextBlink) { blinkAt = now; nextBlink = now+delay(spec.blink); }
    const b = (now-blinkAt)/320, blink = b >= 1 ? 1 : Math.max(.04,b < .42 ? 1-b/.42 : (b-.42)/.58);
    const phase = Math.sin(elapsed/spec.period*Math.PI*2), landing = spec.squash*Math.max(0,-phase), scale = 1+spec.pulse*phase;
    setFrame({ eyes, mouth, blink, transform: `translate(0 ${-spec.bob*phase}) translate(114.2705 114.2705) scale(${scale}) translate(-114.2705 -114.2705) translate(114.2705 228.541) scale(${1+.5*landing} ${1-.5*landing}) translate(-114.2705 -228.541)` });
   },1000/30);
  };
  void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (!disposed) { reduced = value; restart(); } });
  const motion = AccessibilityInfo.addEventListener('reduceMotionChanged',value => { reduced = value; restart(); });
  const lifecycle = AppState.addEventListener('change',value => { active = value === 'active'; restart(); }); restart();
  return () => { disposed = true; clearInterval(timer); motion.remove(); lifecycle.remove(); };
 },[state,animated]);
 return frame;
}

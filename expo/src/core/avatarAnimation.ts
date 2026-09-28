import { POOLS, type MascotState } from '../../../shared/mascot-appearance.ts';
import { BLINK, EXPR_CADENCE, MOTION, bodyTransform } from '../../../shared/mascot-motion.ts';
import { automaticStateForBot, liveStateForBot, type MascotBotProfile } from '../../../shared/mascot-state.ts';
import { EXPRESSIONS, GAZE, MOUTHS, type Ring } from '../../../src/components/cursor-face-data.ts';

export function automaticAvatarState(bot: MascotBotProfile & { activity?: string }, happy = false): MascotState {
  return liveStateForBot(bot) ?? (happy ? 'happy' : automaticStateForBot(bot));
}
export interface AvatarFrame { eyes: Ring[]; mouth: number[]; blink: number; transform: string }
const rings = (expression: number): Ring[] => EXPRESSIONS[expression].map(ring => ring.map(([x, y]) => [x + GAZE[expression][0] * .35, y + GAZE[expression][1] * .35]));
export const restingAvatarFrame = (state: MascotState): AvatarFrame => ({ eyes: rings(POOLS[state][0]), mouth: MOUTHS[POOLS[state][0]], blink: 1, transform: '' });

/** Pure animation engine: desktop pools, cadence, blink curve, spring and body
 * transforms, with an injectable clock/random source for deterministic tests. */
export function createAvatarAnimation(state: MascotState, start: number, random = Math.random) {
  const pool = POOLS[state];
  let last = start, index = pool[0], eyes = rings(index), mouth = [...MOUTHS[index]];
  let from = eyes, fromMouth = mouth, target = eyes, targetMouth = mouth, blend = 1, velocity = 0;
  const delay = (range: [number, number]) => range[0] + random() * (range[1] - range[0]);
  const blinkCadence = BLINK[state];
  let nextExpression = start + delay(EXPR_CADENCE[state]);
  let nextBlink = blinkCadence ? start + delay(blinkCadence) : Infinity;
  let blinkAt = -Infinity;
  return (now: number): AvatarFrame => {
    const elapsed = now - start, dt = Math.min(.1, (now - last) / 1000);
    last = now;
    if (now >= nextExpression) {
      const options = pool.filter(candidate => candidate !== index);
      index = options.length ? options[Math.floor(random() * options.length)] : pool[0];
      from = eyes; fromMouth = mouth; target = rings(index); targetMouth = MOUTHS[index];
      blend = 0; velocity = 0; nextExpression = now + delay(EXPR_CADENCE[state]);
    }
    velocity += (-14 * velocity - 49 * (blend - 1)) * dt;
    blend += velocity * dt;
    const amount = Math.max(0, Math.min(1, blend));
    eyes = from.map((ring, i) => ring.map(([x, y], j) => [x + (target[i][j][0] - x) * amount, y + (target[i][j][1] - y) * amount]));
    mouth = fromMouth.map((value, i) => value + (targetMouth[i] - value) * amount);
    if (now >= nextBlink && blinkCadence) { blinkAt = now; nextBlink = now + delay(blinkCadence); }
    const b = (now - blinkAt) / 320;
    const blink = b >= 1 ? 1 : Math.max(.04, b < .42 ? 1 - b / .42 : (b - .42) / .58);
    return { eyes, mouth, blink, transform: bodyTransform(MOTION[state], elapsed, 1) };
  };
}

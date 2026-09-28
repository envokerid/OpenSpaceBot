import { MAUS_COLORS, type MascotState } from './mascot-appearance.ts';
import { MOTION, type BodyMotion } from './mascot-motion.ts';

// The reference mascot is deliberately mouthless: expression lives in the
// capsule eyes, head tilt, gaze and breathing of its luminous spherical body.
export interface OrbPose {
  x: number; y: number; tilt: number; yaw: number; scaleX: number; scaleY: number;
  eyeLeft: number; eyeRight: number; eyeTilt: number; eyeX: number; eyeY: number;
  smile: number; glow: number;
}
const joyful = new Set<MascotState>(['happy', 'excited', 'celebrate', 'laughing', 'playful', 'proud']);
const sleepy = new Set<MascotState>(['sleeping', 'drowsy', 'powering-down', 'sad', 'bored']);
const focused = new Set<MascotState>(['working', 'writing', 'thinking', 'suspicious', 'angry']);
const surprised = new Set<MascotState>(['surprised', 'scared', 'alerting', 'notifying']);

export function orbColor(color: string): string {
  return Object.hasOwn(MAUS_COLORS, color) ? MAUS_COLORS[color as keyof typeof MAUS_COLORS] : MAUS_COLORS.blue;
}

/** Deterministic seconds-based animation, shared by native GL and desktop. */
export function orbPose(state: MascotState, seconds = 0, animated = true): OrbPose {
  const t = animated ? Math.max(0, seconds) : 0;
  const motion: BodyMotion = MOTION[state];
  const wave = (period: number) => animated ? Math.sin(t * 1000 / period * Math.PI * 2) : 0;
  const bob = motion.bob ? wave(motion.bob[1]) : wave(3600);
  const breath = 1 + (motion.pulse?.[0] ?? .014) * wave(motion.pulse?.[1] ?? 3600);
  const squash = Math.max(0, -bob) * (motion.squash ?? 0) * .18;
  const cycle = t % 5.7;
  const blink = animated && cycle > 5.35 ? Math.max(.06, Math.abs(cycle - 5.525) / .175) : 1;
  let left = 1, right = 1, eyeTilt = 0, eyeX = 0, eyeY = 0;
  if (sleepy.has(state)) { left = right = state === 'sleeping' ? .12 : .45; eyeY = -.035; }
  if (focused.has(state)) { left = right = .72; eyeTilt = .12; }
  if (surprised.has(state)) { left = right = 1.28; }
  if (state === 'curious' || state === 'confused' || state === 'thinking') { left = .72; right = 1.12; eyeY = .035; }
  if (state === 'searching' || state === 'radar') eyeX = wave(2800) * .13;
  if (state === 'listening' || state === 'dictating') { left = right = 1.1; eyeY = .045; }
  // Product-specific performances: following a line while composing, looking
  // between teammates while waiting, and an acknowledging nod on handoff.
  if (state === 'writing') { eyeX = wave(1200) * .075; eyeY = -.035; }
  if (state === 'orbit') { eyeX = wave(3200) * .15; left = .85; right = 1.05; }
  if (state === 'receiving') { eyeY = .04 + wave(700) * .035; }
  if (state === 'shy') { eyeX = -.09; eyeY = -.08; }
  return {
    x: motion.circle ? wave(motion.circle[1]) * .06 : 0,
    y: wave(3600) * .045 + bob * (motion.bob ? motion.bob[0] / 95 : .018),
    tilt: (motion.tilt ?? 0) * Math.PI / 180 + (motion.sway ? wave(motion.sway[1]) * motion.sway[0] * Math.PI / 180 : 0),
    yaw: (state === 'searching' || state === 'radar' ? wave(2800) * .18 : wave(6200) * .035),
    scaleX: breath + squash, scaleY: breath - squash,
    eyeLeft: left * (state === 'sleeping' ? 1 : blink), eyeRight: right * (state === 'sleeping' ? 1 : blink),
    eyeTilt, eyeX, eyeY, smile: joyful.has(state) ? 1 : 0,
    glow: .55 + (state === 'listening' || state === 'dictating' ? .2 * (wave(1100) + 1) : .1 * wave(3000)),
  };
}

/** Higher hover = wider, lighter shadow; fixed ground never bobs with the orb. */
export function orbShadow(height: number) {
  const lift = Math.max(-.2, Math.min(.2, height));
  return { scale: 1 + lift * .9, opacity: .28 - lift * .45 };
}

/** Project the shared floating pose into the fallback's 100×100 SVG space. */
export function orbPortrait(pose: OrbPose) {
  const shadow = orbShadow(pose.y);
  return {
    body: `translate(${50 + pose.x * 35.2} ${44.4 - pose.y * 35.2}) rotate(${-pose.tilt * 180 / Math.PI}) scale(${.86 * pose.scaleX} ${.86 * pose.scaleY}) translate(-50 -50)`,
    eyes: `translate(${pose.eyeX * 35.2} ${-pose.eyeY * 35.2})`,
    shadowRadius: 36 * shadow.scale,
    shadowOpacity: shadow.opacity,
  };
}

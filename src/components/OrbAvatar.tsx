import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { orbColor, orbPortrait } from '../../shared/orb-mascot';
import { useOrbPose } from '../../shared/use-orb-pose';
import { useVisibleAvatarMotion } from '../lib/use-visible-avatar-motion';
import { POOLS, mascotEyeColor, type MascotState } from '../../shared/mascot-appearance';
import type { CursorAvatarHandle } from './CursorAvatar';
import type { OrbSceneOptions } from '../../shared/orb-scene';

export const OrbAvatar = forwardRef<CursorAvatarHandle, OrbSceneOptions & { size: number; label?: string; expression?: number }>(function OrbAvatar({ size, label, expression, ...options }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLSpanElement>(null);
  const live = useRef(options);
  const subscription = useRef<{ update(): void; dispose(): void } | null>(null);
  const [ready, setReady] = useState(false);
  const [reaction, setReaction] = useState<MascotState | null>(null);
  const [blinkAt, setBlinkAt] = useState<number>();
  const [spin, setSpin] = useState<OrbSceneOptions["spin"]>();
  const expressionState = (index: number | undefined) => index === undefined ? null : (Object.keys(POOLS) as MascotState[]).find(state => POOLS[state][0] === index) ?? null;
  const state = reaction ?? expressionState(expression) ?? options.state;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  live.current = { ...options, state, blinkAt, spin };
  useImperativeHandle(ref, () => {
    const react = (state: MascotState, duration = 750) => {
      clearTimeout(timer.current); setReaction(state);
      timer.current = setTimeout(() => setReaction(null), duration);
    };
    return {
      blink: () => setBlinkAt(performance.now() / 1000),
      spin: (duration = 750) => setSpin({ start: performance.now() / 1000, duration: Math.max(100, duration) / 1000 }),
      setExpression: index => react(expressionState(index) ?? 'idle'),
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    void import('../lib/orb-renderer').then(({ registerOrb }) => {
      if (disposed || !canvas.current) return;
      try { subscription.current = registerOrb(canvas.current, () => live.current, () => setReady(true), () => setReady(false)); }
      catch { setReady(false); }
    }).catch(() => { if (!disposed) setReady(false); });
    return () => { disposed = true; subscription.current?.dispose(); subscription.current = null; clearTimeout(timer.current); };
  }, []);
  useEffect(() => { subscription.current?.update(); }, [options.color, options.state, options.animated, options.gaze?.x, options.gaze?.y, options.turn, state, blinkAt, spin, size]);
  const id = useId().replaceAll(':', '');
  const color = orbColor(options.color);
  const eyeColor = mascotEyeColor(options.color);
  const moving = useVisibleAvatarMotion(container, !ready && options.animated !== false);
  const pose = useOrbPose(state, moving);
  const portrait = orbPortrait(pose);
  return <span ref={container} role="img" aria-label={label ? `${label} avatar` : 'Maus avatar'} data-mascot="orb-3d" data-state={state} data-renderer={ready ? "three" : "fallback"} style={{ display: 'inline-block', position: 'relative', width: size, height: size, flexShrink: 0 }}>
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, visibility: ready ? 'hidden' : 'visible' }}>
      <defs><radialGradient id={id} cx="38%" cy="28%" r="75%"><stop stopColor="#c6edff" /><stop offset=".3" stopColor={color} /><stop offset=".78" stopColor={color} /><stop offset="1" stopColor="#a6d9ff" /></radialGradient><radialGradient id={`${id}-shadow`}><stop stopColor="#111827" stopOpacity={portrait.shadowOpacity} /><stop offset="1" stopColor="#111827" stopOpacity="0" /></radialGradient></defs>
      <ellipse cx="50" cy="88.4" rx={portrait.shadowRadius} ry="7.4" fill={`url(#${id}-shadow)`} />
      <g transform={portrait.body}>
      <circle cx="50" cy="50" r="38.5" fill={color} opacity={pose.glow * .3} />
      <circle cx="50" cy="50" r="35.2" fill={`url(#${id})`} />
      <g transform={portrait.eyes} fill={eyeColor}>
        {pose.smile ? <path d="M 37 44 Q 41 38 45 44 M 55 44 Q 59 38 63 44" fill="none" stroke={eyeColor} strokeWidth="3" strokeLinecap="round" /> : [41, 59].map((x, i) => {
          const height = 14 * (i === 0 ? pose.eyeLeft : pose.eyeRight);
          return <rect key={x} x={x - 3.4} y={44 - height / 2} width="6.8" height={height} rx="3.4" />;
        })}
      </g>
      </g>
    </svg>
    <canvas ref={canvas} aria-hidden="true" width={Math.min(256, Math.ceil(size * 2))} height={Math.min(256, Math.ceil(size * 2))} style={{ position: 'absolute', inset: 0, width: size, height: size, visibility: ready ? 'visible' : 'hidden' }} />
  </span>;
});

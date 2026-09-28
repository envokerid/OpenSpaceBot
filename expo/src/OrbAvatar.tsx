import React, { memo, useEffect, useId, useState } from 'react';
import { AccessibilityInfo, AppState, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { orbColor, orbPortrait } from '../../shared/orb-mascot';
import { useOrbPose } from '../../shared/use-orb-pose';
import { mascotEyeColor, type MascotState } from '../../shared/mascot-appearance';
import { createRenderSlots } from '../../shared/mascot-render-slots';
import type { OrbSurfaceProps } from './OrbSurface';

// Reserve hero surfaces so a long roster cannot consume the profile preview's
// budget. Every remaining animated avatar keeps moving in the vector renderer.
const rosterSlots = createRenderSlots(4);
const heroSlots = createRenderSlots(2);
export const OrbAvatar = memo(function OrbAvatar({ name = 'Maus', color = 'white', state = 'idle', size = 52, animated = true }: {
  name?: string; color?: string; state?: MascotState; size?: number; animated?: boolean;
}) {
  const id = useId().replaceAll(':', '');
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [granted, setGranted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [Surface, setSurface] = useState<React.ComponentType<OrbSurfaceProps>>();
  useEffect(() => {
    let disposed = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (!disposed) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const lifecycle = AppState.addEventListener('change', value => setActive(value === 'active'));
    return () => { disposed = true; motion.remove(); lifecycle.remove(); };
  }, []);
  const hero = size >= 80;
  const eligible = active && animated && size >= 28 && !failed;
  useEffect(() => {
    setGranted(false); setReady(false);
    if (!eligible) return;
    return (hero ? heroSlots : rosterSlots).acquire(() => setGranted(true));
  }, [eligible, hero]);
  useEffect(() => {
    if (!granted) return;
    let disposed = false;
    void import('./OrbSurface').then(module => { if (!disposed) setSurface(() => module.default); }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; };
  }, [granted]);
  const base = orbColor(color);
  const eyeColor = mascotEyeColor(color);
  const showSurface = granted && eligible && Surface;
  const pose = useOrbPose(state, animated && active && !reduced && !(ready && !!showSurface));
  const portrait = orbPortrait(pose);
  return <View accessible accessibilityRole="image" accessibilityLabel={`${name} avatar, ${state}`} style={{ width: size, height: size, flexShrink: 0 }}>
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity: ready && showSurface ? 0 : 1 }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs><RadialGradient id={id} cx="38%" cy="28%" r="75%"><Stop offset={0} stopColor="#c6edff" /><Stop offset={0.3} stopColor={base} /><Stop offset={0.78} stopColor={base} /><Stop offset={1} stopColor="#a6d9ff" /></RadialGradient><RadialGradient id={`${id}-shadow`}><Stop offset={0} stopColor="#111827" stopOpacity={portrait.shadowOpacity} /><Stop offset={1} stopColor="#111827" stopOpacity={0} /></RadialGradient></Defs>
        <Ellipse cx={50} cy={88.4} rx={portrait.shadowRadius} ry={7.4} fill={`url(#${id}-shadow)`} />
        <G transform={portrait.body}>
        <Circle cx={50} cy={50} r={38.5} fill={base} opacity={pose.glow * .3} /><Circle cx={50} cy={50} r={35.2} fill={`url(#${id})`} />
        <G transform={portrait.eyes} fill={eyeColor}>
          {pose.smile ? <Path d="M 37 44 Q 41 38 45 44 M 55 44 Q 59 38 63 44" fill="none" stroke={eyeColor} strokeWidth={3} strokeLinecap="round" /> : [41, 59].map((x, i) => {
            const height = 14 * (i === 0 ? pose.eyeLeft : pose.eyeRight);
            return <Rect key={x} x={x - 3.4} y={44 - height / 2} width={6.8} height={height} rx={3.4} />;
          })}
        </G>
        </G>
      </Svg>
    </View>
    {showSurface ? <Surface key={size} size={size} color={color} state={state} animated={animated && !reduced} onReady={() => setReady(true)} onFailure={() => { setFailed(true); setReady(false); }} /> : null}
  </View>;
});

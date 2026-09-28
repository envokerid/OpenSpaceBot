import React, { memo, useEffect, useId, useMemo, useState } from 'react';
import { Image } from 'react-native';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Polygon, Stop, parse } from 'react-native-svg';
import { OrbAvatar } from './OrbAvatar';
import { MAUS_COLORS, mascotEyeColor, type MascotState } from '../../shared/mascot-appearance';
import { useMascotAnimation } from '../../shared/use-mascot-animation';
import { automaticAvatarState } from './core/avatarAnimation';
import { MASCOT_BODIES } from '../../shared/mascot-bodies';
import { botAvatarProfile } from '../../shared/bot-avatar';
import { FACE_CENTRE, mouthFrame } from '../../src/components/cursor-face-data';
import type { Bot } from './core/types';
import type { Client } from './core/client';
import { useAvatarMotion } from './AvatarMotion';
import { useAuthenticatedImage } from './images';

type AvatarProps = {
  bot: { name: string; color: string } & Partial<Pick<Bot, 'id' | 'threadId' | 'waitingForTeammates' | 'title' | 'description' | 'busy' | 'unread' | 'messages' | 'activity' | 'mascotExpression' | 'mascotBody' | 'avatarCrop' | 'avatarUrl'>> & { typing?: boolean; reasoning?: boolean };
  client: Client; size?: number; happy?: boolean; animated?: boolean; state?: MascotState;
};
// Bot objects also change for messages, tasks and other profile settings.
// None of those should rebuild the static body thumbnails in the picker.
export const Avatar = memo(function Avatar({ bot, client, size = 52, happy = false, animated = true, state }: AvatarProps) {
  const mood = useMascotAnimation(bot, state ?? automaticAvatarState(bot, happy), animated && state === undefined);
  const profile = useMemo(() => botAvatarProfile(bot), [bot.avatarCrop, bot.avatarUrl]);
  const { uri } = useAuthenticatedImage(client, profile.avatarCrop === 'mascot' ? undefined : profile.avatarUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  if (uri && !failed && profile.avatarCrop !== 'mascot') return <Image onError={() => setFailed(true)} accessibilityLabel={`${bot.name} avatar`} source={{ uri }} style={{ width: size, height: size, borderRadius: profile.avatarCrop === 'circle' ? size / 2 : profile.avatarCrop === 'rounded' ? size / 5 : 0 }} />;
  if (!bot.mascotBody || bot.mascotBody === 'cursor' || !Object.hasOwn(MASCOT_BODIES, bot.mascotBody)) return <OrbAvatar name={bot.name} color={bot.color} state={mood} size={size} animated={animated} />;
  return <Mascot name={bot.name} color={bot.color} bodyId={bot.mascotBody ?? 'cursor'} state={mood} size={size} animated={animated} />;
}, (a, b) => a.state === b.state && a.client === b.client && a.size === b.size && a.happy === b.happy && a.animated === b.animated
  && a.bot.busy === b.bot.busy
  && a.bot.id === b.bot.id && a.bot.threadId === b.bot.threadId && a.bot.messages === b.bot.messages
  && a.bot.waitingForTeammates === b.bot.waitingForTeammates && a.bot.typing === b.bot.typing && a.bot.reasoning === b.bot.reasoning
  && a.bot.name === b.bot.name && a.bot.color === b.bot.color && a.bot.mascotBody === b.bot.mascotBody
  && automaticAvatarState(a.bot, a.happy) === automaticAvatarState(b.bot, b.happy) && a.bot.avatarCrop === b.bot.avatarCrop
  && a.bot.avatarUrl === b.bot.avatarUrl && a.bot.activity === b.bot.activity);

const Mascot = memo(function Mascot({ name, color, bodyId, state, size, animated }: {
  name: string; color: string; bodyId: NonNullable<Bot['mascotBody']>;
  state: ReturnType<typeof automaticAvatarState>; size: number; animated: boolean;
}) {
  const id = useId().replaceAll(':', '');
  const gradientId = `body-${id}`;
  const clipId = `face-${id}`;
  const body = MASCOT_BODIES[bodyId] ?? MASCOT_BODIES.cursor;
  // Parse only when the silhouette changes. Animation updates native SVG
  // transforms, eye points and mouth geometry; it never reparses the body.
  const artwork = useMemo(() => parse(`<svg>${body.body.replaceAll('{{GRADIENT}}', `url(#${gradientId})`)}</svg>`)?.children, [body, gradientId]);
  const silhouette = useMemo(() => <G transform={body.fit}>{artwork}</G>, [body, artwork]);
  const base = Object.hasOwn(MAUS_COLORS, color) ? MAUS_COLORS[color as keyof typeof MAUS_COLORS] : '#8E8E93';
  const definitions = useMemo(() => {
    const mix = (end: number, amount: number) => '#' + [1, 3, 5].map(i => Math.floor(parseInt(base.slice(i, i + 2), 16) * (1 - amount) + end * amount).toString(16).padStart(2, '0')).join('');
    return <Defs>
      <LinearGradient id={gradientId} x1="100%" y1="0%" x2="0%" y2="100%"><Stop offset={0} stopColor={mix(255, .55)} /><Stop offset={0.55} stopColor={base} /><Stop offset={1} stopColor={mix(0, .42)} /></LinearGradient>
      <ClipPath id={clipId}>{silhouette}</ClipPath>
    </Defs>;
  }, [base, gradientId, clipId, silhouette]);
  const animation = useAvatarMotion(state, animated);
  const eyes = animation.eyes, spec = animation.mouth, frame = mouthFrame(eyes, spec);
  const cos = Math.cos(frame.angle), sin = Math.sin(frame.angle);
  const at = (x: number, y: number) => `${frame.x + x * cos - y * sin} ${frame.y + x * sin + y * cos}`;
  const mouth = `M ${at(-spec[0], 0)} Q ${at(0, spec[1])} ${at(spec[0], 0)}`;
  const face = `translate(${body.anchor.x} ${body.anchor.y}) scale(${body.anchor.scale}) translate(${-FACE_CENTRE[0]} ${-FACE_CENTRE[1]})`;
  return <Svg accessibilityLabel={`${name} avatar`} viewBox="-15 -15 258.541 258.541" width={size} height={size}>
    {definitions}
    <G transform={animation.transform}>
      {silhouette}
      <G clipPath={`url(#${clipId})`}><G transform={face} fill={mascotEyeColor(color)}>
        {eyes.map((ring, index) => {
          const cy = ring.reduce((n, point) => n + point[1], 0) / ring.length;
          return <Polygon key={index} points={ring.map(([x, y]) => `${x},${cy + (y - cy) * animation.blink}`).join(' ')} />;
        })}
        <Path d={mouth} fill="none" stroke={mascotEyeColor(color)} strokeWidth={7.5} strokeLinecap="round" />
      </G></G>
    </G>
  </Svg>;
});

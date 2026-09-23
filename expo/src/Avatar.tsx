import React, { useEffect, useId, useState } from 'react';
import { Image } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { MASCOT_BODIES } from '../../shared/mascot-bodies';
import { botAvatarProfile } from '../../shared/bot-avatar';
import { FACE_CENTRE, mouthFrame } from '../../src/components/cursor-face-data';
import type { Bot } from './core/types';
import type { Client } from './core/client';
import { useAvatarMotion } from './AvatarMotion';
import { useAuthenticatedImage } from './images';

// Same body catalog, face geometry and palette as the desktop and native apps.
const colors: Record<string, string> = { green: '#009957', blue: '#377FE6', red: '#D94B52', orange: '#E78531', purple: '#8057C8', cyan: '#0EA5C6', pink: '#D84F8B', yellow: '#D8A729', teal: '#01A492', coral: '#E5634E' };
export function Avatar({ bot, client, size = 52, happy = false }: { bot: { name: string; color: string } & Partial<Pick<Bot, 'activity' | 'mascotBody' | 'avatarCrop' | 'avatarUrl'>>; client: Client; size?: number; happy?: boolean }) {
  const svgId = useId().replaceAll(':', '');
  const bodyId = `body-${svgId}`;
  const faceClipId = `face-${svgId}`;
  const profile = botAvatarProfile(bot);
  const { uri } = useAuthenticatedImage(client, profile.avatarCrop === 'mascot' ? undefined : profile.avatarUrl);
  const [failed, setFailed] = useState(false); useEffect(() => setFailed(false), [uri]);
  const body = MASCOT_BODIES[bot.mascotBody ?? 'cursor'] ?? MASCOT_BODIES.cursor;
  const animation = useAvatarMotion(happy ? 'happy' : bot.activity === 'waiting-on-you' ? 'listening' : bot.activity === 'working' ? 'working' : 'idle', size >= 60 && (!uri || failed));
  const eyes = animation.eyes, spec = animation.mouth, frame = mouthFrame(eyes,spec);
  const cos = Math.cos(frame.angle); const sin = Math.sin(frame.angle);
  const at = (x: number, y: number) => `${frame.x + x * cos - y * sin} ${frame.y + x * sin + y * cos}`;
  const mouth = `M ${at(-spec[0], 0)} Q ${at(0, spec[1])} ${at(spec[0], 0)}`;
  const face = `translate(${body.anchor.x} ${body.anchor.y}) scale(${body.anchor.scale}) translate(${-FACE_CENTRE[0]} ${-FACE_CENTRE[1]})`;
  if (uri && !failed && profile.avatarCrop !== 'mascot') return <Image onError={() => setFailed(true)} accessibilityLabel={`${bot.name} avatar`} source={{ uri }} style={{ width: size, height: size, borderRadius: profile.avatarCrop === 'circle' ? size / 2 : profile.avatarCrop === 'rounded' ? size / 5 : 0 }} />;
  const base = colors[bot.color] ?? '#8E8E93';
  const mix = (end: number, amount: number) => '#' + [1, 3, 5].map(i => Math.floor(parseInt(base.slice(i, i + 2), 16) * (1 - amount) + end * amount).toString(16).padStart(2, '0')).join('');
  const pattern = `<defs><linearGradient id="${bodyId}" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0" stop-color="${mix(255, 0.55)}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${mix(0, 0.42)}"/></linearGradient><clipPath id="${faceClipId}"><g transform="${body.fit}">${body.body.replaceAll('{{GRADIENT}}','white')}</g></clipPath></defs>`;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -15 258.541 258.541">${pattern}<g transform="${animation.transform}"><g transform="${body.fit}">${body.body.replaceAll('{{GRADIENT}}', `url(#${bodyId})`)}</g><g clip-path="url(#${faceClipId})"><g transform="${face}" fill="white">${eyes.map(ring => { const cy = ring.reduce((n,p) => n+p[1],0)/ring.length; return `<polygon points="${ring.map(([x,y]) => `${x},${cy+(y-cy)*animation.blink}`).join(' ')}"/>`; }).join('')}<path d="${mouth}" fill="none" stroke="white" stroke-width="7.5" stroke-linecap="round"/></g></g></g></svg>`;
  return <SvgXml accessibilityLabel={`${bot.name} avatar`} xml={xml} width={size} height={size} />;
}

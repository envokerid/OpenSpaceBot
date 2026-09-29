import { describe, expect, it } from 'vitest';
import { redundantScreenIds } from './transcript-screens';
import type { WireMessage } from './wire';

const reply: WireMessage = {
  id: 'reply', role: 'bot', kind: 'text', at: 1, turnId: 'turn', text: 'Here is the screenshot.',
  attachments: [{ kind: 'image', path: '/api/attachments/screenshot.png', mime: 'image/png' }],
};
const screen: WireMessage = { id: 'screen', role: 'bot', kind: 'screen', at: 3, png: 'pixels' };
const digest: WireMessage = { id: 'digest', role: 'bot', kind: 'digest', at: 2, turnId: 'turn' };

describe('redundant end-of-turn screen previews', () => {
  it('keeps the reply image and hides its automatic screen even across a digest', () => {
    expect([...redundantScreenIds([reply, digest, screen])]).toEqual(['screen']);
    expect(reply.attachments).toHaveLength(1);
  });

  it('keeps a screen when the reply has no displayed image or is outside the loaded history', () => {
    expect(redundantScreenIds([{ ...reply, attachments: [], text: 'See screenshot.png' }, screen]).size).toBe(0);
    expect(redundantScreenIds([screen]).size).toBe(0);
  });

  it('does not carry an old image into a new request, turn, or speaker', () => {
    const user: WireMessage = { id: 'user', role: 'user', kind: 'text', text: 'Next task', at: 2 };
    const activity: WireMessage = { id: 'tool', role: 'bot', kind: 'activity', at: 2, turnId: 'next' };
    expect(redundantScreenIds([reply, user, screen]).size).toBe(0);
    expect(redundantScreenIds([reply, activity, screen]).size).toBe(0);
    expect(redundantScreenIds([reply, { ...screen, turnId: 'next' }]).size).toBe(0);
    expect(redundantScreenIds([reply, { ...screen, from: { botId: 'other', name: 'Other', color: 'blue' } }]).size).toBe(0);
  });

  it('uses the most recent reply and does not hide subsequent standalone captures', () => {
    expect(redundantScreenIds([reply, { ...reply, id: 'next-reply', attachments: [] }, screen]).size).toBe(0);
    expect([...redundantScreenIds([reply, screen, { ...screen, id: 'second-screen' }])]).toEqual(['screen']);
  });
});

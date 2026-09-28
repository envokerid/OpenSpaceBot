import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imageConnectionPatch, imageKeyRemoval, uploadedAvatar, RESET_MASCOT, generateAvatar } from '../src/core/avatarSettings.ts';
import { Client } from '../src/core/client.ts';
import { MAUS_COLORS, MAUS_COLOR_NAMES, PICKABLE_STATES, POOLS, normalizeState } from '../../shared/mascot-appearance.ts';

test('image upload switches a mascot to circle and preserves a chosen image crop', () => {
  assert.deepEqual(uploadedAvatar('/tmp/bot-avatar.png', 'mascot'), { avatarUrl: '/api/attachments/bot-avatar.png', avatarCrop: 'circle' });
  for (const crop of ['circle', 'rounded', 'square'] as const) assert.equal(uploadedAvatar('C:\\attachments\\bot-avatar.webp', crop).avatarCrop, crop);
  assert.throws(() => uploadedAvatar('/tmp/avatar.svg', 'circle'));
  assert.deepEqual(RESET_MASCOT, { avatarCrop: 'mascot', color: 'white', mascotExpression: null, mascotBody: 'cursor' });
  assert.equal('avatarUrl' in RESET_MASCOT, false, 'reset retains the uploaded image for later reuse');
});

test('provider keys are routed only to their own provider; blank entry keeps saved keys', () => {
  assert.deepEqual(imageConnectionPatch('openai', '', '', ' openai-test '), { imageGen: { provider: 'openai', key: 'openai-test' } });
  assert.deepEqual(imageConnectionPatch('xai', '', '', ' xai-test '), { imageGen: { provider: 'xai' }, xai: { key: 'xai-test' } });
  assert.deepEqual(imageConnectionPatch('custom', 'http://localhost:1234/v1/images/generations/', ' local-model ', ''), { imageGen: { provider: 'custom', customUrl: 'http://localhost:1234/v1', customModel: 'local-model' } });
  assert.equal(imageConnectionPatch('custom', 'http://localhost:1234', 'model', ' custom-test ').imageGen.customApiKey, 'custom-test');
  assert.deepEqual(imageKeyRemoval('openai'), { imageGen: { key: '' } });
  assert.deepEqual(imageKeyRemoval('custom'), { imageGen: { customApiKey: '' } });
  assert.deepEqual(imageKeyRemoval('xai'), { xai: { key: '' } });
});

test('invalid custom connection is rejected before a credential can be saved', () => {
  for (const url of ['http://public.example.com', 'https://user:password@example.com', 'https://example.com?key=secret']) assert.throws(() => imageConnectionPatch('custom', url, 'model', 'new-key'));
  for (const model of ['', 'a\nb', 'x'.repeat(201)]) assert.throws(() => imageConnectionPatch('custom', 'http://localhost', model, 'new-key'));
});

test('all desktop picker states and legacy expressions resolve to valid face pools', () => {
  for (const state of PICKABLE_STATES) { assert.equal(normalizeState(state), state); assert.ok(POOLS[state].length); }
  for (const color of MAUS_COLOR_NAMES) assert.match(MAUS_COLORS[color], /^#[\da-f]{6}$/i);
  assert.equal(MAUS_COLORS.white, '#FFFFFF');
  assert.equal(normalizeState('friendly'), 'happy');
  assert.equal(normalizeState('skeptical'), 'suspicious');
  for (const value of ['invalid', '__proto__', 'constructor', 'toString']) assert.equal(normalizeState(value), null);
});

test('generation saves edited identity first, accepts an empty prompt, and uses the returned crop', async () => {
  const calls: { path: string; body: unknown }[] = [];
  const client = new Client({ id: 'test', name: 'Test', endpoint: { url: 'http://localhost', kind: 'lan', priority: 0 }, endpoints: [], server: false }, 'test', async (url, init) => {
    calls.push({ path: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ bot: { avatarCrop: 'circle', avatarUrl: '/api/attachments/generated.png' } }));
  });
  const identity = { name: 'New name', title: 'Artist', description: 'Paints' };
  const bot = await generateAvatar(client, 'bot-1', '  ', identity);
  assert.deepEqual(calls.map(c => c.body), [identity, { prompt: '' }]);
  assert.ok(calls[0].path.endsWith('/profile'));
  assert.ok(calls[1].path.endsWith('/avatar/generate'));
  assert.equal(bot.avatarCrop, 'circle');
});

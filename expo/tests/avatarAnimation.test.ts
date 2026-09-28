import assert from 'node:assert/strict';
import { test } from 'node:test';
import { automaticAvatarState, createAvatarAnimation, restingAvatarFrame } from '../src/core/avatarAnimation.ts';
import { POOLS, type MascotState } from '../../shared/mascot-appearance.ts';
import { EXPR_CADENCE, BLINK, MOTION, bodyTransform } from '../../shared/mascot-motion.ts';

test('mobile chooses activity and profile moods automatically, ignoring old emotion selections', () => {
  assert.equal(automaticAvatarState({ name: 'Helper', mascotExpression: 'angry' }), 'idle');
  assert.equal(automaticAvatarState({ name: 'Helper', mascotExpression: 'sleeping', activity: 'working' }), 'working');
  assert.equal(automaticAvatarState({ name: 'Helper', busy: true, activity: 'waiting-on-you' }), 'listening');
  assert.equal(automaticAvatarState({ name: 'Research assistant' }), 'searching');
  assert.equal(automaticAvatarState({ name: 'Helper', waitingForTeammates: true }), 'orbit');
  assert.equal(automaticAvatarState({ name: 'Helper', busy: true, typing: true }), 'writing');
  assert.equal(automaticAvatarState({ name: 'Helper', busy: true, reasoning: true }), 'thinking');
  assert.equal(automaticAvatarState({ name: 'Designer' }), 'playful');
  assert.equal(automaticAvatarState({ name: 'Helper', unread: true }), 'notifying');
  assert.equal(automaticAvatarState({ name: 'Helper', messages: [{ kind: 'options' }, { kind: 'digest' }] }), 'curious');
});

test('faces automatically cycle through the desktop pools at the desktop cadence', () => {
  for (const state of Object.keys(POOLS) as MascotState[]) {
    const step = createAvatarAnimation(state, 0, () => 0);
    const initial = restingAvatarFrame(state);
    const nextAt = EXPR_CADENCE[state][0];
    assert.deepEqual(step(nextAt - 1).eyes, initial.eyes, `${state}: remains on first face before cadence`);
    let frame = step(nextAt);
    for (let elapsed = 33; elapsed <= 660; elapsed += 33) frame = step(nextAt + elapsed);
    if (POOLS[state].length > 1) assert.notDeepEqual(frame.eyes, initial.eyes, `${state}: smoothly changes face without any user selection`);
    else assert.deepEqual(frame.eyes, initial.eyes);
    assert.ok(frame.eyes.flat().flat().every(Number.isFinite));
  }
});

test('blinking and body movement follow desktop behavior instead of falling back to idle', () => {
  for (const state of Object.keys(POOLS) as MascotState[]) {
    const step = createAvatarAnimation(state, 0, () => 0);
    const cadence = BLINK[state];
    if (cadence) {
      assert.equal(step(cadence[0] - 1).blink, 1);
      step(cadence[0]);
      assert.ok(step(cadence[0] + 130).blink < .1, `${state}: closes eyes`);
      assert.equal(step(cadence[0] + 321).blink, 1);
    } else assert.equal(step(20_000).blink, 1, `${state}: never blinks`);
    const moving = createAvatarAnimation(state, 0, () => 0)(333);
    assert.equal(moving.transform, bodyTransform(MOTION[state], 333, 1));
  }
  assert.notEqual(createAvatarAnimation('playful', 0)(333).transform, createAvatarAnimation('idle', 0)(333).transform);
});

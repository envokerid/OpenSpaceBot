import { describe, expect, it } from 'vitest';
import { POOLS, MAUS_COLOR_NAMES, MAUS_COLORS, type MascotState } from './mascot-appearance';
import { orbColor, orbPortrait, orbPose, orbShadow } from './orb-mascot';
import { createOrbScene } from './orb-scene';
import { createRenderSlots } from './mascot-render-slots';
import { Mesh } from 'three';

describe('reference orb animation', () => {
  it('keeps all existing app states bounded and finite, even after long idle times', () => {
    for (const state of Object.keys(POOLS) as MascotState[]) {
      for (const time of [0, .25, 1, 5.525, 100_000]) {
        const pose = orbPose(state, time);
        expect(Object.values(pose).every(Number.isFinite), state).toBe(true);
        expect(pose.scaleX).toBeGreaterThan(.8);
        expect(pose.scaleY).toBeGreaterThan(.8);
        expect(pose.eyeLeft).toBeGreaterThan(0);
        expect(pose.eyeRight).toBeGreaterThan(0);
        expect(Math.abs(pose.y)).toBeLessThan(.2);
      }
    }
  });
  it('remains completely still with reduced motion while retaining each expression', () => {
    for (const state of Object.keys(POOLS) as MascotState[]) {
      expect(orbPose(state, 500, false)).toEqual(orbPose(state, 0, false));
    }
    expect(orbPose('sleeping', 0, false).eyeLeft).toBeLessThan(.2);
    expect(orbPose('celebrate', 0, false).smile).toBe(1);
    expect(orbPose('alerting', 0, false).eyeLeft).toBeGreaterThan(1);
    expect(orbPose('thinking', 0, false).eyeLeft).not.toBe(orbPose('thinking', 0, false).eyeRight);
  });
  it('blinks, searches and bounces with distinct activity poses', () => {
    expect(orbPose('idle', 5.525).eyeLeft).toBeLessThan(.1);
    expect(orbPose('searching', .7).eyeX).toBeCloseTo(.13);
    expect(orbPose('celebrate', .12).y).toBeGreaterThan(.09);
    expect(orbPose('sleeping', 5.525).eyeLeft).toBe(.12);
  });
  it('floats above a grounded shadow that softens and spreads as it rises', () => {
    const low = orbShadow(-.15), high = orbShadow(.15);
    expect(high.scale).toBeGreaterThan(low.scale);
    expect(high.opacity).toBeLessThan(low.opacity);
    expect(orbPose('idle', .9).y).toBeGreaterThan(.05);
    expect(orbPose('writing', .3).eyeX).not.toBe(orbPose('working', .3).eyeX);
    expect(orbPose('orbit', .8).eyeX).toBeGreaterThan(.1);
    const rig = createOrbScene();
    rig.update({ color: 'blue', state: 'idle' }, 0);
    const ground = rig.scene.getObjectByName('ground-shadow')!;
    const height = ground.position.y;
    rig.update({ color: 'blue', state: 'celebrate' }, .12);
    expect(ground.position.y).toBe(height);
    expect(rig.scene.getObjectByName('floating-orb')!.position.y).toBeGreaterThan(0);
    rig.dispose();
  });
  it('uses saved colors and safely falls back to reference blue', () => {
    for (const color of MAUS_COLOR_NAMES) expect(orbColor(color)).toBe(MAUS_COLORS[color]);
    for (const color of ['garbage', '__proto__', 'constructor']) expect(orbColor(color)).toBe(MAUS_COLORS.blue);
  });
  it('keeps vector fallback bodies, eyes and shadows moving with the same pose as GL', () => {
    const rest = orbPortrait(orbPose('idle', 0));
    const floating = orbPortrait(orbPose('idle', .9));
    expect(floating.body).not.toBe(rest.body);
    expect(floating.shadowRadius).toBeGreaterThan(rest.shadowRadius);
    expect(floating.shadowOpacity).toBeLessThan(rest.shadowOpacity);
    expect(orbPortrait(orbPose('writing', .3)).eyes).not.toBe(orbPortrait(orbPose('writing', 0)).eyes);
    expect(orbPortrait(orbPose('idle', 10, false))).toEqual(orbPortrait(orbPose('idle', 0, false)));
  });
});

describe('shared Three.js scene', () => {
  it('updates geometry in place and disposes every unique GPU resource exactly once', () => {
    const rig = createOrbScene();
    const resources = new Set<{ addEventListener(type: 'dispose', callback: () => void): void }>();
    rig.scene.traverse(object => {
      if (object instanceof Mesh) {
        resources.add(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => resources.add(material));
      }
    });
    let disposed = 0;
    resources.forEach(resource => resource.addEventListener('dispose', () => disposed++));
    const children = rig.scene.children[0].children.slice();
    for (const state of Object.keys(POOLS) as MascotState[]) {
      rig.update({ color: 'blue', state }, 10);
      rig.update({ color: 'coral', state, animated: false }, 11);
      expect(rig.scene.children[0].children).toEqual(children);
    }
    rig.dispose(); rig.dispose();
    expect(disposed).toBe(resources.size);
    expect(rig.scene.children).toHaveLength(0);
  });
});

describe('native surface budget', () => {
  it('bounds GL contexts and grants the next live waiter when a surface unmounts', () => {
    const slots = createRenderSlots(1), granted: string[] = [];
    const first = slots.acquire(() => granted.push('first'));
    const canceled = slots.acquire(() => granted.push('canceled'));
    const second = slots.acquire(() => granted.push('second'));
    canceled(); expect(granted).toEqual(['first']);
    first(); first(); expect(granted).toEqual(['first', 'second']);
    const third = slots.acquire(() => granted.push('third'));
    expect(granted).toHaveLength(2);
    second(); expect(granted).toEqual(['first', 'second', 'third']);
    third();
  });
});

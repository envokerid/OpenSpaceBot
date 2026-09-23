import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupAvatarTiles } from '../src/core/groupAvatar.ts';

test('group avatar collage includes every member', () => {
  for (const count of [1, 2, 3, 4, 5, 9, 17]) {
    const tiles = groupAvatarTiles(count, 38);
    assert.equal(tiles.length, count);
    assert.ok(tiles.every(tile => tile.size > 0));
  }
});

test('avatars form a circle and stay entirely inside the header space', () => {
  for (const count of [2, 3, 4, 5, 9, 17]) {
    const tiles = groupAvatarTiles(count, 40);
    const radii = tiles.map(tile => Math.hypot(tile.left + tile.size / 2 - 20, tile.top + tile.size / 2 - 20));
    assert.ok(radii.every(radius => Math.abs(radius - radii[0]) < 0.000001));
    assert.ok(tiles.every(tile => tile.left >= -0.000001 && tile.top >= -0.000001 && tile.left + tile.size <= 40.000001 && tile.top + tile.size <= 40.000001));
  }
});

test('group avatar collage handles empty and invalid dimensions', () => {
  assert.deepEqual(groupAvatarTiles(0, 38), []);
  assert.deepEqual(groupAvatarTiles(2, 0), []);
});

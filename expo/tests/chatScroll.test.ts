import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatScrollPosition } from '../src/core/chatScroll.ts';

function atBottom() {
  const position = new ChatScrollPosition();
  position.contentHeight = 1600;
  position.viewportHeight = 600;
  position.record(1000, 1600, 600);
  return position;
}

test('leaving a small gap above the bottom preserves manual position through reply and keyboard changes', () => {
  const position = atBottom();
  position.interacting = true;
  position.record(920, 1600, 600); // Inside the old 140px snap zone.
  position.interacting = false;
  assert.equal(position.target(), undefined);
  position.contentHeight = 2100;
  assert.equal(position.target(), undefined, 'completed reply must not pull a reader away');
  position.viewportHeight = 400;
  assert.equal(position.target(), undefined);
});

test('a completed reply follows the bottom after typing without treating content growth as a gesture', () => {
  const position = atBottom();
  assert.equal(position.target(), undefined, 'already visible: no redundant scroll');
  position.contentHeight = 2200;
  position.record(1000, 2200, 600);
  assert.equal(position.target(), 1600);
  position.record(1600, 2200, 600);
  assert.equal(position.target(), undefined);
  position.viewportHeight = 350;
  assert.equal(position.target(), 1850, 'keyboard resize keeps the reply above the composer');
});

test('dragging or momentum cancels follow work; returning to the bottom only enables future updates', () => {
  const position = atBottom();
  position.interacting = true;
  position.contentHeight = 2000;
  assert.equal(position.target(), undefined);
  position.record(800, 2000, 600);
  position.interacting = false;
  assert.equal(position.target(), undefined);
  position.interacting = true;
  position.record(1400, 2000, 600);
  position.interacting = false;
  assert.equal(position.target(), undefined, 'release at bottom needs no correction');
  position.contentHeight = 2400;
  assert.equal(position.target(), 1800);
});

test('sending explicitly resumes following and short conversations have no negative scroll target', () => {
  const position = atBottom();
  position.following = false;
  position.record(200, 1600, 600);
  position.following = true;
  assert.equal(position.target(), 1000);
  position.contentHeight = 300;
  position.record(0, 300, 600);
  assert.equal(position.target(), undefined);
  position.viewportHeight = 0;
  assert.equal(position.target(), undefined, 'wait for the viewport measurement');
});

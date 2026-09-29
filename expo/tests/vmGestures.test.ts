import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVmGestures, type VmTouch } from '../src/core/vmGestures.ts';
import type { MobileVmInput } from '../../shared/mobile-vm.ts';

const point = (x = 100, y = 100): VmTouch => ({ local: { x, y }, desktop: { x: x * 4, y: y * 4 } });

test('a single tap sends exactly one left click at the desktop coordinates', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point()); gestures.end(point());
 assert.deepEqual(inputs, []);
 t.mock.timers.tick(300);
 assert.deepEqual(inputs, [{ type: 'click', x: 400, y: 400, button: 'left', count: 1 }]);
 t.mock.timers.tick(1000);
 assert.equal(inputs.length, 1);
});

test('nearby double taps send one double click with no preliminary single click', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point()); gestures.end(point());
 t.mock.timers.tick(180);
 gestures.begin(point(103, 101));
 t.mock.timers.tick(150); // The first tap's deadline passes while the second is down.
 assert.deepEqual(inputs, []);
 gestures.end(point(103, 101));
 t.mock.timers.tick(1000);
 assert.deepEqual(inputs, [{ type: 'click', x: 412, y: 404, button: 'left', count: 2 }]);
});

test('holding right-clicks before release and lifting never adds a left click', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point());
 t.mock.timers.tick(499);
 assert.deepEqual(inputs, []);
 t.mock.timers.tick(1);
 assert.deepEqual(inputs, [{ type: 'click', x: 400, y: 400, button: 'right', count: 1 }]);
 t.mock.timers.tick(1500);
 gestures.end(point());
 t.mock.timers.tick(1000);
 assert.equal(inputs.length, 1);
});

test('separated taps are singles, not double clicks', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point()); gestures.end(point());
 t.mock.timers.tick(300);
 gestures.begin(point()); gestures.end(point());
 t.mock.timers.tick(300);
 assert.deepEqual(inputs.map(input => input.type === 'click' && input.count), [1, 1]);
});

test('quick taps far apart are not combined into a double click', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point()); gestures.end(point());
 t.mock.timers.tick(100);
 gestures.begin(point(200)); gestures.end(point(200));
 t.mock.timers.tick(300);
 assert.deepEqual(inputs, [
  { type: 'click', x: 400, y: 400, button: 'left', count: 1 },
  { type: 'click', x: 800, y: 400, button: 'left', count: 1 },
 ]);
});

test('touch movement cancels taps and holds even if the finger returns', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point()); gestures.move(point(130)); gestures.move(point());
 t.mock.timers.tick(600); gestures.end(point()); t.mock.timers.tick(600);
 assert.deepEqual(inputs, []);
});

test('small finger movement uses phone points rather than scaled desktop pixels', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point()); gestures.move(point(108)); gestures.end(point(108));
 t.mock.timers.tick(300);
 assert.deepEqual(inputs, [{ type: 'click', x: 432, y: 400, button: 'left', count: 1 }]);
});

test('closing, losing control, or interrupted touches cancel pending gestures', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point()); gestures.end(point()); gestures.cancel();
 t.mock.timers.tick(1000);
 gestures.begin(point()); gestures.cancel();
 t.mock.timers.tick(1000); gestures.end(point());
 t.mock.timers.tick(1000);
 assert.deepEqual(inputs, []);
});

test('letterbox touches and leaving the image do not produce clicks', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(undefined); gestures.end(point());
 gestures.begin(point()); gestures.move(undefined); gestures.end(point());
 gestures.begin(point()); gestures.end(undefined);
 t.mock.timers.tick(1000);
 assert.deepEqual(inputs, []);
});

for (const [endY, direction] of [[180, 'up'], [20, 'down']] as const) {
 test(`vertical swipe scrolls ${direction} without clicking or dragging`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const inputs: MobileVmInput[] = [];
  const gestures = createVmGestures(input => inputs.push(input));
  gestures.begin(point()); gestures.move(point(103, endY));
  t.mock.timers.tick(1000); // Moving cancels the right-click hold timer.
  assert.deepEqual(inputs, []);
  gestures.end(point(103, endY));
  t.mock.timers.tick(1000);
  assert.deepEqual(inputs, [{ type: 'scroll', x: 400, y: 400, direction }]);
 });
}

test('horizontal swipes and swipes returning to their origin do not scroll or click', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point()); gestures.move(point(180, 103)); gestures.end(point(180, 103));
 gestures.begin(point()); gestures.move(point(100, 180)); gestures.end(point());
 t.mock.timers.tick(1000);
 assert.deepEqual(inputs, []);
});

test('release displacement still scrolls when no intermediate move event was delivered', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point()); gestures.end(point(100, 180));
 t.mock.timers.tick(1000);
 assert.deepEqual(inputs, [{ type: 'scroll', x: 400, y: 400, direction: 'up' }]);
});

test('interrupted swipes and movement after a right click do not scroll', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const inputs: MobileVmInput[] = [];
 const gestures = createVmGestures(input => inputs.push(input));
 gestures.begin(point()); gestures.move(point(100, 180)); gestures.cancel(); gestures.end(point(100, 180));
 assert.deepEqual(inputs, []);
 gestures.begin(point()); t.mock.timers.tick(600);
 gestures.move(point(100, 180)); gestures.end(point(100, 180));
 t.mock.timers.tick(1000);
 assert.deepEqual(inputs, [{ type: 'click', x: 400, y: 400, button: 'right', count: 1 }]);
});

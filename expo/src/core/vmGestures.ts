import type { MobileVmInput } from '../../../shared/mobile-vm.ts';

type Point = { x: number; y: number };
export type VmTouch = { local: Point; desktop: Point };
const TAP_DELAY_MS = 280;
const HOLD_DELAY_MS = 500;
const TOUCH_SLOP = 14;
const near = (a: VmTouch, b: VmTouch) => Math.hypot(a.local.x - b.local.x, a.local.y - b.local.y) <= TOUCH_SLOP;

/** Distinguish gestures before sending remote input: a double tap must not
 * first send a single click, and lifting after a hold must not left-click. */
export function createVmGestures(send: (input: MobileVmInput) => void) {
 let active: { from: VmTouch; moved: boolean; double: boolean } | undefined;
 let tap: VmTouch | undefined;
 let tapTimer: ReturnType<typeof setTimeout> | undefined;
 let holdTimer: ReturnType<typeof setTimeout> | undefined;
 const clearTap = () => { clearTimeout(tapTimer); tapTimer = undefined; tap = undefined; };
 const cancel = () => { clearTap(); clearTimeout(holdTimer); holdTimer = undefined; active = undefined; };
 const click = (point: VmTouch, button: 'left' | 'right', count: 1 | 2) => send({ type: 'click', ...point.desktop, button, count });
 return {
  cancel,
  begin(point: VmTouch | undefined) {
   clearTimeout(holdTimer);
   active = undefined;
   if (!point) { cancel(); return; }
   const double = !!tap && near(tap, point);
   const previous = tap;
   clearTap();
   if (previous && !double) click(previous, 'left', 1);
   active = { from: point, moved: false, double };
   holdTimer = setTimeout(() => {
    if (!active) return;
    const from = active.from;
    active = undefined;
    click(from, 'right', 1);
   }, HOLD_DELAY_MS);
  },
  move(point: VmTouch | undefined) {
   if (!active) return;
   if (!point) { cancel(); return; }
   if (!near(active.from, point)) {
    active.moved = true;
    clearTimeout(holdTimer);
   }
  },
  end(point: VmTouch | undefined) {
   clearTimeout(holdTimer);
   const gesture = active;
   active = undefined;
   if (!gesture || !point) return;
   if (gesture.moved || !near(gesture.from, point)) {
    const dx = point.local.x - gesture.from.local.x;
    const dy = point.local.y - gesture.from.local.y;
    // Finger movement follows the content: dragging down scrolls up. Use
    // the starting position so the intended pane receives the wheel input.
    if (Math.abs(dy) > TOUCH_SLOP && Math.abs(dy) > Math.abs(dx)) {
     send({ type: 'scroll', ...gesture.from.desktop, direction: dy > 0 ? 'up' : 'down' });
    }
   } else if (near(gesture.from, point)) {
    if (gesture.double) click(point, 'left', 2);
    else {
     tap = point;
     tapTimer = setTimeout(() => {
      const pending = tap;
      clearTap();
      if (pending) click(pending, 'left', 1);
     }, TAP_DELAY_MS);
    }
   }
  },
 };
}

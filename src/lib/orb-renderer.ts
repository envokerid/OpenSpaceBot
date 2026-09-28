import { WebGLRenderer } from 'three';
import { createOrbScene, type OrbSceneOptions } from '../../shared/orb-scene';

type Viewer = {
  canvas: HTMLCanvasElement; context: CanvasRenderingContext2D;
  rig: ReturnType<typeof createOrbScene>; options: () => OrbSceneOptions;
  visible: boolean; dirty: boolean; presented: boolean; ready: () => void; failed: () => void;
};
const viewers = new Set<Viewer>();
let renderer: WebGLRenderer | undefined;
let frame = 0;
let last = 0;
let reduced = false;
let lost = false;
let media: MediaQueryList | undefined;

function invalidate() {
  viewers.forEach(viewer => { viewer.dirty = true; });
  schedule();
}
function motionChanged() { reduced = media?.matches ?? false; invalidate(); }
function schedule() {
  if (!frame && !lost && !document.hidden && [...viewers].some(v => v.visible && (v.dirty || (!reduced && v.options().animated !== false)))) {
    frame = requestAnimationFrame(draw);
  }
}
function draw(now: number) {
  frame = 0;
  if (!renderer || lost || document.hidden) return;
  if (now - last < 1000 / 30) { schedule(); return; }
  last = now;
  for (const viewer of viewers) {
    const options = viewer.options();
    const animated = options.animated !== false && !reduced;
    if (!viewer.visible || (!viewer.dirty && !animated)) continue;
    try {
      viewer.rig.update({ ...options, animated }, now / 1000);
      renderer.render(viewer.rig.scene, viewer.rig.camera);
      viewer.context.clearRect(0, 0, viewer.canvas.width, viewer.canvas.height);
      viewer.context.drawImage(renderer.domElement, 0, 0, viewer.canvas.width, viewer.canvas.height);
      viewer.dirty = false;
      if (!viewer.presented) { viewer.presented = true; viewer.ready(); }
    } catch {
      viewer.visible = false;
      viewer.failed();
    }
  }
  schedule();
}
function contextLost(event: Event) {
  event.preventDefault();
  lost = true;
  viewers.forEach(viewer => { viewer.presented = false; viewer.failed(); });
  cancelAnimationFrame(frame); frame = 0;
}
function contextRestored() { lost = false; invalidate(); }

/** One offscreen GL context paints every avatar's inexpensive 2D canvas. */
export function registerOrb(canvas: HTMLCanvasElement, options: () => OrbSceneOptions, ready: () => void, failed: () => void) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  if (!renderer) {
    lost = false; last = 0;
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(256, 256, false);
    renderer.setClearColor(0, 0);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    renderer.domElement.addEventListener('webglcontextrestored', contextRestored);
    media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced = media.matches;
    media.addEventListener('change', motionChanged);
    document.addEventListener('visibilitychange', invalidate);
  }
  const viewer: Viewer = { canvas, context, rig: createOrbScene(), options, ready, failed, dirty: true, visible: true, presented: false };
  viewers.add(viewer);
  const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
    viewer.visible = entries[0].isIntersecting;
    viewer.dirty = true;
    schedule();
  });
  observer?.observe(canvas);
  schedule();
  return {
    update() { viewer.dirty = true; schedule(); },
    dispose() {
      observer?.disconnect(); viewers.delete(viewer); viewer.rig.dispose();
      if (!viewers.size && renderer) {
        cancelAnimationFrame(frame); frame = 0;
        media?.removeEventListener('change', motionChanged);
        document.removeEventListener('visibilitychange', invalidate);
        renderer.domElement.removeEventListener('webglcontextlost', contextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', contextRestored);
        renderer.dispose(); renderer.forceContextLoss(); renderer = undefined;
      }
    },
  };
}

// One clock for vector avatars, including those waiting for a native GL slot.
// Subscribers supply their own lifecycle/visibility policy. No work is scheduled
// until the first viewer arrives, or after the final viewer leaves.
const viewers = new Set<(seconds: number) => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let start = 0;

export function subscribeMascotFrames(viewer: (seconds: number) => void) {
  viewers.add(viewer);
  if (timer === undefined) {
    start = Date.now();
    timer = setInterval(() => {
      const seconds = (Date.now() - start) / 1000;
      viewers.forEach(draw => draw(seconds));
    }, 1000 / 30);
  }
  return () => {
    viewers.delete(viewer);
    if (!viewers.size) { clearInterval(timer); timer = undefined; }
  };
}

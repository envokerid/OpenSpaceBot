/** Bound native GL surfaces; queued avatars keep their matching SVG fallback. */
export function createRenderSlots(limit: number) {
  const active = new Set<() => void>();
  const waiting = new Set<() => void>();
  return {
    acquire(grant: () => void) {
      if (active.size < limit) { active.add(grant); grant(); }
      else waiting.add(grant);
      return () => {
        waiting.delete(grant);
        if (!active.delete(grant)) return;
        const next = waiting.values().next().value;
        if (next) { waiting.delete(next); active.add(next); next(); }
      };
    },
  };
}

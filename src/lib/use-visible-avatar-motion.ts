import { useEffect, useState, type RefObject } from 'react';

/** The vector fallback obeys the same lifecycle policy as the GL renderer. */
export function useVisibleAvatarMotion(target: RefObject<HTMLElement | null>, enabled: boolean) {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    const update = () => setRunning(visible && !document.hidden && !motion.matches);
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      update();
    });
    if (target.current) observer?.observe(target.current);
    document.addEventListener('visibilitychange', update);
    motion.addEventListener('change', update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      motion.removeEventListener('change', update);
    };
  }, [enabled, target]);
  return enabled && running;
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeMascotFrames } from './mascot-frames';

describe('vector avatar animation clock', () => {
  const release: Array<() => void> = [];
  afterEach(() => { release.splice(0).forEach(stop => stop()); vi.useRealTimers(); });

  it('keeps a long roster moving on one clock, and releases it after the last viewer', () => {
    vi.useFakeTimers();
    const draw = Array.from({ length: 25 }, () => vi.fn());
    draw.forEach(viewer => release.push(subscribeMascotFrames(viewer)));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    draw.forEach(viewer => expect(viewer.mock.calls.length).toBeGreaterThan(20));
    const before = draw[0].mock.calls.length;
    release[0](); release[0]();
    vi.advanceTimersByTime(1000);
    expect(draw[0]).toHaveBeenCalledTimes(before);
    expect(draw[24].mock.calls.length).toBeGreaterThan(before);
    release.splice(0).forEach(stop => stop());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resumes after all viewers pause without accumulating duplicate timers', () => {
    vi.useFakeTimers();
    const draw = vi.fn();
    const pause = subscribeMascotFrames(draw);
    pause();
    vi.advanceTimersByTime(60_000);
    expect(draw).not.toHaveBeenCalled();
    release.push(subscribeMascotFrames(draw));
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalled();
    expect(draw.mock.lastCall![0]).toBeLessThan(.2);
    expect(vi.getTimerCount()).toBe(1);
  });
});

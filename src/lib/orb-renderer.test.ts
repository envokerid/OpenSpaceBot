import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gpu = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn(), loss: vi.fn(), created: vi.fn(), listeners: new Map<string, (event: Event) => void>() }));
vi.mock('three', async importOriginal => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: class {
    constructor() { gpu.created(); }
    domElement = {
      addEventListener: (name: string, callback: (event: Event) => void) => gpu.listeners.set(name, callback),
      removeEventListener: (name: string) => gpu.listeners.delete(name),
    };
    render = gpu.render; dispose = gpu.dispose; forceContextLoss = gpu.loss;
    setSize() {} setClearColor() {}
  },
}));
import { registerOrb } from './orb-renderer';

let pending: Map<number, FrameRequestCallback>;
let frameId: number;
let now: number;
let visibility: () => void;
const cleanups: (() => void)[] = [];
const tick = () => {
  now += 40;
  const callbacks = [...pending.values()]; pending.clear();
  callbacks.forEach(callback => callback(now));
};
function mount(animated = true) {
  const context = { clearRect: vi.fn(), drawImage: vi.fn() };
  const canvas = { width: 96, height: 96, getContext: () => context } as unknown as HTMLCanvasElement;
  const ready = vi.fn(), failed = vi.fn();
  const subscription = registerOrb(canvas, () => ({ state: 'idle', color: 'blue', animated }), ready, failed);
  cleanups.push(subscription.dispose);
  return { ...subscription, ready, failed, context };
}
beforeEach(() => {
  vi.clearAllMocks(); gpu.listeners.clear(); pending = new Map(); frameId = 0; now = 1000;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
  vi.stubGlobal('document', { hidden: false, addEventListener: (_name: string, callback: () => void) => { visibility = callback; }, removeEventListener() {} });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  vi.stubGlobal('IntersectionObserver', undefined);
});
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });

describe('desktop shared GL lifecycle', () => {
  it('renders many avatars through one GL context and releases it after the last unmount', () => {
    const first = mount(), second = mount(); tick();
    expect(gpu.created).toHaveBeenCalledTimes(1);
    expect(gpu.render).toHaveBeenCalledTimes(2);
    expect(first.context.drawImage).toHaveBeenCalledTimes(1);
    tick(); expect(first.ready).toHaveBeenCalledTimes(1);
    first.dispose(); expect(gpu.dispose).not.toHaveBeenCalled();
    second.dispose(); expect(gpu.dispose).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(0);
  });
  it('draws static portraits only on mount or changes', () => {
    const avatar = mount(false); tick();
    expect(gpu.render).toHaveBeenCalledTimes(1); expect(pending.size).toBe(0);
    avatar.update(); tick(); expect(gpu.render).toHaveBeenCalledTimes(2);
    expect(pending.size).toBe(0);
  });
  it('stops drawing while the app is hidden and resumes when visible', () => {
    mount(); tick();
    Object.assign(document, { hidden: true }); tick();
    expect(gpu.render).toHaveBeenCalledTimes(1); expect(pending.size).toBe(0);
    Object.assign(document, { hidden: false }); visibility(); tick();
    expect(gpu.render).toHaveBeenCalledTimes(2);
  });
  it('shows the fallback on context loss and repaints after restoration', () => {
    const avatar = mount(); tick();
    gpu.listeners.get('webglcontextlost')!(new Event('webglcontextlost'));
    expect(avatar.failed).toHaveBeenCalledOnce(); expect(pending.size).toBe(0);
    avatar.update(); expect(pending.size).toBe(0);
    gpu.listeners.get('webglcontextrestored')!(new Event('webglcontextrestored')); tick();
    expect(avatar.ready).toHaveBeenCalledTimes(2);
  });
});

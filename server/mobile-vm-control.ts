import type { ComputerControl } from './computer-control.ts';

const fail = (message: string) => Object.assign(new Error(message), { status: 409 });
type Lease = { id: string; botId: string; threadId: string; target: string; key: string; expires: number; busy: boolean };
/** A short renewable lease: a killed/offline phone cannot leave the bot paused.
 * Inputs are never queued, and cleanup only releases this phone's own hold. */
export class MobileVmControl {
  private leases = new Map<string, Lease>();
  private control: ComputerControl;
  private now: () => number;
  constructor(control: ComputerControl, now = Date.now) { this.control = control; this.now = now; }
  sweep() {
    for (const lease of this.leases.values()) if (!lease.busy && lease.expires <= this.now()) this.remove(lease);
  }
  private remove(lease: Lease) {
    this.control.releaseLease(lease.key, lease.id);
    this.leases.delete(lease.target);
  }
  take(botId: string, threadId: string, target: string, key: string, id: string) {
    this.sweep();
    const existing = this.leases.get(target);
    if (existing && (existing.id !== id || existing.botId !== botId || existing.threadId !== threadId)) throw fail('This VM is controlled on another screen.');
    const acquired = this.control.acquireLease(key, id);
    if (!acquired.owned) throw fail('This computer is controlled on another screen.');
    this.leases.set(target, existing ?? { id, botId, threadId, target, key, expires: 0, busy: false });
    this.leases.get(target)!.expires = this.now() + 60_000;
    return { held: true };
  }
  private owned(botId: string, threadId: string, id: string) {
    this.sweep();
    const lease = [...this.leases.values()].find(value => value.id === id && value.botId === botId && value.threadId === threadId);
    if (!lease || !this.control.ownsLease(lease.key, id)) throw fail('Control ended. Take control again to continue.');
    return lease;
  }
  renew(botId: string, threadId: string, id: string) {
    const lease = this.owned(botId, threadId, id);
    lease.expires = this.now() + 60_000;
    return { held: true };
  }
  release(botId: string, threadId: string, id: string) {
    const lease = [...this.leases.values()].find(value => value.id === id && value.botId === botId && value.threadId === threadId);
    if (lease?.busy) throw fail('An input is still finishing. Try returning control again.');
    if (lease) this.remove(lease);
    return { held: false };
  }
  holds(target: string) { this.sweep(); return this.leases.has(target); }
  async input(botId: string, threadId: string, target: string, id: string, perform: (check: () => void) => Promise<void>) {
    const lease = this.owned(botId, threadId, id);
    if (lease.target !== target) throw fail('The conversation changed computers. Take control again.');
    if (lease.busy) throw fail('An input is still finishing.');
    lease.busy = true;
    lease.expires = this.now() + 60_000;
    try {
      await perform(() => { this.owned(botId, threadId, id); });
      return { held: true };
    } finally { lease.busy = false; this.sweep(); }
  }
}

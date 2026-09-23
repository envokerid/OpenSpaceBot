// Only live arrivals in the visible chat can enter. Paging, REST snapshots,
// hidden screens, and recycled rows never replay an entrance.
export class BubbleEntrances {
  private seen = new Set<string>();
  private pending = new Map<string, number>();
  private tail?: string;
  private initialized = false;
  private visible = false;

  update(ids: string[], loaded: boolean, visible = true, arrivals: readonly string[] = ids, now = Date.now()) {
    const canEnter = visible && this.visible && this.initialized;
    if (!visible) this.pending.clear();
    this.visible = visible;
    if (!loaded) return;
    const live = new Set(arrivals);
    const previousTail = this.tail ? ids.indexOf(this.tail) : -1;
    for (const [index, id] of ids.entries()) {
      if (canEnter && (!this.tail || (previousTail >= 0 && index > previousTail)) && !this.seen.has(id) && live.has(id)) this.pending.set(id, now);
      this.seen.add(id);
    }
    for (const [id, at] of this.pending) if (!ids.includes(id) || now - at > 1000) this.pending.delete(id);
    this.tail = ids.at(-1);
    this.initialized = true;
  }

  claim(id: string, now = Date.now()) {
    const at = this.pending.get(id);
    this.pending.delete(id);
    return this.visible && at !== undefined && now - at <= 1000;
  }
}

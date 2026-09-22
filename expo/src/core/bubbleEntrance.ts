// Keep entrance animations scoped to newly appended rows. History pagination,
// message patches and FlatList remounts must not replay them.
export class BubbleEntrances {
  private seen = new Set<string>();
  private pending = new Set<string>();
  private tail?: string;
  private initialized = false;

  update(ids: string[], loaded: boolean) {
    if (!loaded) return;
    const previousTail = this.tail ? ids.indexOf(this.tail) : -1;
    ids.forEach((id, index) => {
      if (this.initialized && !this.seen.has(id) && (!this.tail || (previousTail >= 0 && index > previousTail))) this.pending.add(id);
      this.seen.add(id);
    });
    this.tail = ids.at(-1);
    this.initialized = true;
  }

  claim(id: string) {
    return this.pending.delete(id);
  }
}

// Manual scrolling only records intent. It must never issue a corrective scroll
// when a drag or momentum ends, even when the user stops close to the bottom.
export class ChatScrollPosition {
  following = true;
  interacting = false;
  contentHeight = 0;
  viewportHeight = 0;
  offset = 0;

  record(offset: number, contentHeight: number, viewportHeight: number) {
    this.offset = offset;
    if (this.interacting) {
      this.following = Math.max(0, contentHeight - viewportHeight) - Math.max(0, offset) <= 24;
    }
  }

  target() {
    if (!this.following || this.interacting || this.viewportHeight <= 0) return undefined;
    const bottom = Math.max(0, this.contentHeight - this.viewportHeight);
    return Math.abs(bottom - this.offset) > 1 ? bottom : undefined;
  }
}

import { APIError, Client } from './client.ts';
import { fold, hydrate, initialState, mergeLatestPage, mergeMessages, type State, type StateFrame } from './store.ts';
import { stream } from './sse.ts';
import type { AvatarPatch } from './avatarSettings.ts';
import type { Frame, Page } from './types.ts';

export class Session {
  client: Client;
  state = initialState();
  private listeners = new Set<() => void>();
  private controller?: AbortController;
  private generation = 0;
  private activeThread?: string;
  private screens = false;
  private revision = 0;
  private journal: { revision: number; frame: StateFrame }[] = [];
  private refreshId = 0;
  private pageIds = new Map<string, number>();
  onNotification?: (frame: Extract<Frame, { kind: 'notify' }>) => void;
  constructor(client: Client) { this.client = client; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private commit(state: State) { this.state = state; this.listeners.forEach(fn => fn()); }
  applyAvatar(botId: string, avatar: AvatarPatch) {
    const frame: StateFrame = { kind: 'avatar.saved', botId, avatar };
    this.journal.push({ revision: ++this.revision, frame });
    if (this.journal.length > 10_000) this.journal.splice(0, 1000);
    this.commit(fold(this.state, frame));
  }
  async refresh(generation = this.generation) {
    const revision = this.revision;
    const requestId = ++this.refreshId;
    const fleet = await this.client.fleet();
    const threads = new Set<string>();
    const owners = [...fleet.bots, ...fleet.groups];
    if (this.activeThread && owners.some(owner => owner.threadId === this.activeThread || owner.tasks?.some(task => task.threadId === this.activeThread))) threads.add(this.activeThread);
    for (const bot of fleet.bots) for (const task of bot.tasks ?? []) {
      if (task.activity === 'waiting-on-you' && task.threadId !== bot.threadId) threads.add(task.threadId);
    }
    const extra: Record<string, Page> = {};
    await Promise.all([...threads].map(async thread => { extra[thread] = await this.client.page(thread); }));
    if (generation === this.generation && requestId === this.refreshId) {
      let next = hydrate(this.state, fleet, extra);
      // Replay events received while a manual refresh was in flight. Otherwise
      // a late REST snapshot can erase an approval or a newly settled reply.
      for (const entry of this.journal) if (entry.revision > revision) next = fold(next, entry.frame);
      this.commit(next);
    }
  }
  async load(thread: string, options: { before?: string; around?: string } = {}) {
    this.activeThread = thread;
    const generation = this.generation;
    const revision = this.revision;
    const requestId = (this.pageIds.get(thread) ?? 0) + 1;
    this.pageIds.set(thread, requestId);
    const page = await this.client.page(thread, options);
    if (generation !== this.generation || requestId !== this.pageIds.get(thread)) return;
    const old = this.state.pages[thread];
    const merged = options.before && old ? { ...page, activeLeafId: old.activeLeafId, messages: mergeMessages(page.messages, old.messages) } : options.around ? page : mergeLatestPage(old, page);
    let next = { ...this.state, pages: { ...this.state.pages, [thread]: merged } };
    for (const entry of this.journal) {
      if (entry.revision > revision && 'threadId' in entry.frame && entry.frame.threadId === thread) next = fold(next, entry.frame);
    }
    this.commit(next);
  }
  start(screens = this.screens) {
    this.stop(); this.screens = screens;
    const generation = this.generation;
    const controller = new AbortController(); this.controller = controller;
    this.commit({ ...this.state, ...(screens ? {} : { screens: {} }), status: 'connecting', error: undefined });
    void this.run(generation, controller.signal);
  }
  setScreens(screens: boolean) {
    this.screens = screens;
    if (this.controller) this.start(screens);
    else if (!screens) this.commit({ ...this.state, screens: {} });
  }
  stop() { this.generation++; this.controller?.abort(); this.controller = undefined; }
  private async run(generation: number, signal: AbortSignal) {
    let failures = 0;
    while (!signal.aborted) {
      try {
        // Only hello resumes/rehydrates. Frames remain buffered in the stream
        // while hydration runs, so no delta can get lost behind a snapshot.
        await stream(this.client, this.state.cursor, this.screens, signal, async frame => {
          if (signal.aborted) return;
          if (frame.kind === 'hello') {
            if (!frame.resumed) await this.refresh(generation);
            if (signal.aborted) return;
            failures = 0;
            this.commit({ ...fold(this.state, frame), status: 'connected', error: undefined });
          } else {
            if (frame.kind !== 'screen') this.journal.push({ revision: ++this.revision, frame });
            if (this.journal.length > 10_000) this.journal.splice(0, 1000);
            this.commit(fold(this.state, frame));
            if (frame.kind === 'notify') this.onNotification?.(frame);
          }
        });
      } catch (error) {
        if (signal.aborted) return;
        const revoked = error instanceof APIError && [401, 403].includes(error.status);
        this.commit({ ...this.state, status: revoked ? 'revoked' : 'offline', error: error instanceof Error ? error.message : 'Connection lost.' });
        if (revoked) return;
        // Snapshot recovery also works when a proxy closes SSE immediately.
        try { await this.refresh(generation); } catch { /* retain last good state */ }
        // Safe reads may try another explicitly invited route. Mutations are
        // never automatically retried on a different computer address.
        if (!(error instanceof APIError)) {
          const candidates = this.client.connection.endpoints;
          if (candidates.length > 1) {
            const index = candidates.findIndex(e => e.url === this.client.connection.endpoint.url);
            this.client.connection = { ...this.client.connection, endpoint: candidates[(index + 1) % candidates.length] };
          }
        }
        failures++;
        await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
          const timer = setTimeout(finish, Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
          signal.addEventListener('abort', finish, { once: true });
        });
      }
    }
  }
}

import { saveAvatar, type AvatarPatch } from './avatarSettings.ts';
import type { Session } from './session.ts';
import type { Bot } from './types.ts';

export function avatarAppearance(bot: AvatarPatch): AvatarPatch {
  return { color: bot.color, mascotBody: bot.mascotBody ?? 'cursor', mascotExpression: bot.mascotExpression ?? null, avatarCrop: bot.avatarCrop ?? 'mascot', avatarUrl: bot.avatarUrl ?? null };
}
export interface AvatarEditorSnapshot {
  appearance: AvatarPatch;
  pending: boolean;
  saving: boolean;
  error?: string;
}
const same = (a: AvatarPatch, b: AvatarPatch) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => b[key as keyof AvatarPatch] === value);

/** Immediate preview, trailing debounce, and one request at a time. Draft fields
 * cover incoming SSE snapshots until their save succeeds. Failures retain the
 * latest choices for an explicit retry instead of losing taps or retrying forever. */
export class AvatarEditor {
  private base: AvatarPatch;
  private draft: AvatarPatch = {};
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private listeners = new Set<() => void>();
  private state: AvatarEditorSnapshot;
  private save: (patch: AvatarPatch) => Promise<AvatarPatch>;
  private delay: number;
  constructor(initial: AvatarPatch, save: (patch: AvatarPatch) => Promise<AvatarPatch>, delay = 200) {
    this.base = avatarAppearance(initial);
    this.state = { appearance: this.base, pending: false, saving: false };
    this.save = save;
    this.delay = delay;
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(saving = this.state.saving, error?: string) {
    const appearance = { ...this.base, ...this.draft };
    const pending = Object.keys(this.draft).length > 0;
    if (same(appearance, this.state.appearance) && pending === this.state.pending && saving === this.state.saving && error === this.state.error) return;
    this.state = { appearance: same(appearance, this.state.appearance) ? this.state.appearance : appearance, pending, saving, error };
    this.listeners.forEach(listener => listener());
  }
  receive(bot: AvatarPatch) {
    this.base = avatarAppearance(bot);
    this.publish(this.state.saving, this.state.error);
  }
  edit(patch: AvatarPatch) {
    if (Object.entries(patch).every(([key, value]) => this.state.appearance[key as keyof AvatarPatch] === value)) return;
    this.draft = { ...this.draft, ...patch };
    this.publish();
    clearTimeout(this.timer);
    // A running request drains the latest combined draft when it finishes.
    if (!this.running) this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, this.delay);
  }
  flush = async (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    if (!Object.keys(this.draft).length) return;
    this.publish(true);
    this.running = this.drain();
    try { await this.running; }
    finally { this.running = undefined; }
  };
  private async drain() {
    try {
      while (Object.keys(this.draft).length) {
        const sent = { ...this.draft };
        const saved = await this.save(sent);
        this.base = avatarAppearance(saved);
        // Only retire fields that still match this request, never newer taps.
        for (const key of Object.keys(sent) as (keyof AvatarPatch)[]) {
          if (this.draft[key] === sent[key]) delete this.draft[key];
        }
        this.publish(Object.keys(this.draft).length > 0);
      }
      this.publish(false);
    } catch (error) {
      this.publish(false, error instanceof Error ? error.message : 'Could not save avatar. Try again.');
      throw error;
    }
  }
}

// Closing/reopening a bot must reuse its pending save rather than starting a
// competing writer. Entries (including retryable drafts) live only as long as
// this connection; no credentials or profiles go into a process-global cache.
const editors = new WeakMap<Session, Map<string, AvatarEditor>>();
export function avatarEditorFor(session: Session, bot: Bot): AvatarEditor {
  let bots = editors.get(session);
  if (!bots) { bots = new Map(); editors.set(session, bots); }
  let editor = bots.get(bot.id);
  if (!editor) {
    editor = new AvatarEditor(bot, async patch => {
      const saved = await saveAvatar(session.client, bot.id, patch);
      // Commit the confirmed appearance even when SSE is paused or buffering.
      session.applyAvatar(bot.id, avatarAppearance(saved));
      return saved;
    });
    bots.set(bot.id, editor);
  }
  return editor;
}

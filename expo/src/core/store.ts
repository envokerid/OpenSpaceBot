import { roomSelectionPending } from "../../../shared/room-election.ts";
import type { Bot, Group, Message, Frame, Fleet, Page, BotQueuedMessages } from './types.ts';

export interface State {
  hydrated: boolean;
  bots: Bot[]; groups: Group[]; sections: string[]; pages: Record<string, Page>;
  streaming: Record<string, string>; reasoning: Record<string, string>;
  // Reply generation ends before the server finishes saving hidden digests.
  typing: Record<string, boolean>;
  typingTurns: Record<string, Record<string, boolean>>;
  arrivals: Record<string, string[]>;
  queues: BotQueuedMessages; screens: Record<string, { png: string; mime: string }>;
  cursor?: string; status: 'connecting' | 'connected' | 'offline' | 'revoked'; error?: string;
}
export const initialState = (): State => ({ hydrated: false, bots: [], groups: [], sections: [], pages: {}, streaming: {}, reasoning: {}, typing: {}, typingTurns: {}, arrivals: {}, queues: {}, screens: {}, status: 'connecting' });
export function mergeMessages(older: Message[], newer: Message[]) {
  const messages = new Map(older.map(m => [m.id, m]));
  for (const m of newer) messages.set(m.id, m);
  return [...messages.values()].sort((a, b) => a.at - b.at);
}
// Keep the older, already loaded prefix only when the latest page overlaps it.
// An empty/disjoint replacement (clear/restore/search) must not resurrect history.
export function mergeLatestPage(old: Page | undefined, page: Page): Page {
  if (!old || !page.messages.length || page.hasMore === false) return page;
  const ids = new Set(page.messages.map(message => message.id));
  const overlap = old.messages.findIndex(message => ids.has(message.id));
  if (overlap <= 0) return page;
  const older = old.messages.slice(0, overlap).filter(message => message.at <= page.messages[0].at);
  return older.length ? { ...page, messages: mergeMessages(older, page.messages), hasMore: old.hasMore } : page;
}
export function hydrate(state: State, fleet: Fleet, extra: Record<string, Page> = {}): State {
  const pages: Record<string, Page> = {};
  for (const item of [...fleet.bots, ...fleet.groups]) {
    pages[item.threadId] = mergeLatestPage(state.pages[item.threadId], { messages: item.messages ?? [], hasMore: item.hasMore, activeLeafId: item.activeLeafId });
  }
  for (const [thread, page] of Object.entries(extra)) pages[thread] = mergeLatestPage(state.pages[thread], page);
  return { ...state, hydrated: true, bots: fleet.bots, groups: fleet.groups, sections: fleet.sections ?? [], pages, queues: fleet.botQueuedMessages ?? {}, streaming: {}, reasoning: {}, typing: {}, typingTurns: {}, arrivals: {} };
}
export function visibleMessages(page?: Page): Message[] {
  if (!page) return [];
  if (!page.activeLeafId) return page.messages;
  const byId = new Map(page.messages.map(m => [m.id, m]));
  if (!byId.has(page.activeLeafId)) return page.messages;
  const chain: Message[] = [];
  const visited = new Set<string>();
  let message = byId.get(page.activeLeafId);
  while (message && !visited.has(message.id)) {
    visited.add(message.id); chain.unshift(message);
    message = message.parentId ? byId.get(message.parentId) : undefined;
  }
  return chain;
}
export function isTyping(state: State, threadId: string, busy: boolean): boolean {
  const messages = visibleMessages(state.pages[threadId]);
  if (messages.some(message => message.goalRun?.election)) return busy && roomSelectionPending(messages);
  const known = state.typing[threadId];
  if (known !== undefined) return known;
  // A snapshot may arrive while the server still owns a finished turn's
  // resources. Don't invent another reply after its text or hidden digest.
  const last = visibleMessages(state.pages[threadId]).findLast(message => message.role === 'user' || message.kind === 'text' || message.kind === 'digest');
  return busy && !(last?.role === 'bot' && (last.kind === 'text' || last.kind === 'digest'));
}
export function fold(state: State, frame: Frame): State {
  let next = { ...state };
  const typing = (thread: string, turn: string | undefined, active: boolean, clear = false) => {
    const turns = clear ? {} : { ...state.typingTurns[thread] };
    const id = turn ?? 'unscoped';
    if (active) turns[id] = true; else delete turns[id];
    next.typingTurns = { ...state.typingTurns, [thread]: turns };
    next.typing = { ...state.typing, [thread]: Object.values(turns).some(Boolean) };
  };
  switch (frame.kind) {
    case 'sections': next.sections = frame.sections; break;
    case 'hello': next.cursor = frame.cursor; break;
    case 'bot': {
      const old = state.bots.find(b => b.id === frame.bot.id);
      const bot = { ...old, ...frame.bot, messages: old?.messages ?? [] };
      next.bots = old ? state.bots.map(b => b.id === bot.id ? bot : b) : [...state.bots, bot];
      break;
    }
    case 'group': {
      const old = state.groups.find(g => g.id === frame.group.id);
      const group = { ...old, ...frame.group, messages: old?.messages ?? [] };
      next.groups = old ? state.groups.map(g => g.id === group.id ? group : g) : [...state.groups, group];
      break;
    }
    case 'bot.deleted': next.bots = state.bots.filter(b => b.id !== frame.botId); break;
    case 'group.deleted': next.groups = state.groups.filter(g => g.id !== frame.groupId); break;
    case 'bot.queued': if (frame.queues && typeof frame.queues === 'object') next.queues = frame.queues; break;
    case 'message':
    case 'message.patch': {
      const page = state.pages[frame.threadId] ?? { messages: [] };
      if (frame.kind === 'message' && !page.messages.some(message => message.id === frame.message.id)) {
        next.arrivals = { ...state.arrivals, [frame.threadId]: [...(state.arrivals[frame.threadId] ?? []), frame.message.id].slice(-128) };
      }
      next.pages = { ...state.pages, [frame.threadId]: { ...page, messages: mergeMessages(page.messages, [frame.message]), ...(frame.kind === 'message' ? { activeLeafId: frame.message.id } : {}) } };
      if (frame.kind === 'message' && frame.message.role === 'bot' && (frame.message.kind === 'text' || frame.message.kind === 'digest')) {
        next.streaming = { ...state.streaming, [frame.threadId]: '' };
        next.reasoning = { ...state.reasoning, [frame.threadId]: '' };
        // Digests belong to a finished turn and must not hide a new speaker.
        if (frame.message.kind === 'text') {
          const turns = Object.keys(state.typingTurns[frame.threadId] ?? {});
          typing(frame.threadId, frame.message.turnId ?? (turns.length === 1 ? turns[0] : undefined), false);
        }
      }
      if (frame.message.queueId) next.queues = { ...state.queues, [frame.threadId]: (state.queues[frame.threadId] ?? []).filter(q => q.queueId !== frame.message.queueId) };
      break;
    }
    case 'thread': next.pages = { ...state.pages, [frame.threadId]: { ...(state.pages[frame.threadId] ?? { messages: [] }), activeLeafId: frame.activeLeafId } }; break;
    case 'runtime': {
      const event = frame.event;
      if (event.type === 'content.delta') {
        const key = event.streamKind === 'reasoning_text' ? 'reasoning' : 'streaming';
        next[key] = { ...state[key], [event.threadId]: (state[key][event.threadId] ?? '') + event.delta };
        if (event.delta) typing(event.threadId, event.turnId, true);
      } else if (event.type === 'turn.completed' || event.type === 'turn.started' || event.type === 'session.exited') {
        next.streaming = { ...state.streaming, [event.threadId]: '' };
        next.reasoning = { ...state.reasoning, [event.threadId]: '' };
        typing(event.threadId, event.turnId, event.type === 'turn.started', event.type === 'session.exited' && !event.turnId);
      }
      break;
    }
    case 'screen': next.screens = { ...state.screens, [frame.threadId]: { png: frame.png, mime: frame.mime ?? 'image/png' } }; break;
  }
  if (frame.seq !== undefined && next.cursor) next.cursor = `${next.cursor.split(':')[0]}:${frame.seq}`;
  return next;
}

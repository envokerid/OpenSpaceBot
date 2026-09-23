import type { WireBot, WireGroup, WireMessage, WireTask, ServerFrame, BotQueuedMessages } from '../../../shared/wire.ts';

export type { WireMessage as Message, WireTask as Task, BotQueuedMessages };
export type Bot = WireBot & Page;
export type Group = WireGroup & Page;
export interface Page { messages: WireMessage[]; hasMore?: boolean; activeLeafId?: string | null }
export interface Fleet { bots: Bot[]; groups: Group[]; botQueuedMessages?: BotQueuedMessages; sections?: string[] }
export type Frame = (ServerFrame | { kind: 'hello'; cursor: string; resumed: boolean }) & { seq?: number };
export interface Endpoint { url: string; kind: 'hosted' | 'tailnet' | 'lan' | 'bonjour'; priority: number }
export interface Connection {
  id: string;
  name: string;
  endpoint: Endpoint;
  endpoints: Endpoint[];
  server: boolean;
  scopes?: string[];
  deviceId?: string;
}
export interface Invite { name: string; endpoints: Endpoint[]; credential: string; server: boolean }
export interface Destination { kind: 'bots' | 'groups'; id: string; threadId: string }
export interface SearchHit { threadId: string; messageId: string; botId?: string; groupId?: string; text: string; snippet?: string }
export interface Instance { instanceId: string; displayName: string; driverKind?: string; snapshot?: { state: string }; models: { default: string; options: { id: string; label?: string }[] }; capabilities?: { queueing?: boolean; images?: boolean; effortLevels?: string[]; agentsMcp?: boolean } }
export interface Upload { path: string; name: string; kind?: 'image' | 'file' }
export interface Draft { text: string; files: Upload[]; sendId?: string; sending?: boolean; channelMode?: 'chat' | 'goal' }
export const destinationKey = (d: Destination) => `${d.kind}:${d.id}:${d.threadId}`;
export const canAdminister = (c: Connection) => !c.server || !!c.scopes?.includes('admin');

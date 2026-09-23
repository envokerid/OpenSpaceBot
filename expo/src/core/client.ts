import type { Bot, Connection, Destination, Fleet, Group, Instance, Invite, Page, SearchHit, Upload } from './types.ts';
import type { BotPermissionsPatch } from '../../../shared/bot-permissions.ts';

export class APIError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export type Fetcher = typeof globalThis.fetch;
export const routeId = (id: string) => {
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid resource identifier.');
  return id;
};
export const destinationPath = (d: Destination) => `/api/${d.kind}/${routeId(d.id)}`;

export class Client {
  connection: Connection;
  token: string;
  fetcher: Fetcher;
  constructor(connection: Connection, token: string, fetcher: Fetcher = globalThis.fetch) {
    this.connection = connection; this.token = token; this.fetcher = fetcher;
  }
  async response(path: string, init: RequestInit = {}, timeout = 20_000): Promise<Response> {
    if (!path.startsWith('/api/') || path.includes('://') || path.includes('..')) throw new Error('Invalid API path.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal?.aborted) controller.abort();
    init.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeout);
    try {
      const result = await this.fetcher(`${this.connection.endpoint.url}${path}`, {
        ...init, redirect: 'error', signal: controller.signal,
        headers: { ...init.headers, ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      });
      if (!result.ok) {
        const body = await result.json().catch(() => ({})) as { error?: string };
        throw new APIError(result.status, body.error ?? `The computer returned ${result.status}.`);
      }
      // Consume ordinary bodies under the same timeout, including slow bodies.
      const bytes = await result.arrayBuffer();
      return new Response(bytes, { status: result.status === 204 ? 200 : result.status, headers: result.headers });
    } finally { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
  }
  async request<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, timeout = 20_000): Promise<T> {
    const response = await this.response(path, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }, timeout);
    // React Native's Response polyfill treats ArrayBuffer text as Latin-1.
    // Decode the original bytes explicitly so non-ASCII server text survives.
    const text = new TextDecoder().decode(await response.arrayBuffer());
    return (text ? JSON.parse(text) : {}) as T;
  }
  fleet() { return this.request<Fleet>('/api/bots?messages=50'); }
  renameBot(botId: string, name: string) {
    if (!name.trim()) throw new Error('Enter a bot name.');
    return this.request<{ bot: Bot }>(`/api/bots/${routeId(botId)}/profile`, 'PATCH', { name: name.trim() });
  }
  deleteBot(botId: string) {
    return this.request(`/api/bots/${routeId(botId)}`, 'DELETE');
  }
  createGroup(name: string, memberIds: string[]) {
    if (!memberIds.length) throw new Error('Choose at least one bot.');
    return this.request<{ group: Group }>('/api/groups', 'POST', {
      name: name.trim(), memberIds,
      setup: { bulletin: '', defaultResponder: { kind: 'member', botId: memberIds[0] } },
    });
  }
  startGroupChat(groupId: string) {
    // Preserve the existing responder, instructions and working folder.
    return this.request<{ group: Group }>(`/api/groups/${routeId(groupId)}/setup`, 'PATCH', { action: 'skip' });
  }
  groupMembers(groupId: string, memberIds: string[], expectedMemberIds: string[], instructions?: { bulletin?: string; expectedBulletin?: string; judgeModelSelection?: Group["judgeModelSelection"] | null; expectedJudgeModelSelection?: Group["judgeModelSelection"] | null }) {
    return this.request<{ group: Group }>(`/api/groups/${routeId(groupId)}/members`, 'PATCH', { memberIds, expectedMemberIds, ...instructions });
  }
  page(thread: string, options: { before?: string; around?: string } = {}) {
    return this.request<Page>(`/api/threads/${routeId(thread)}/messages?${new URLSearchParams({ limit: '50', ...options })}`);
  }
  instances() { return this.request<{ instances: Instance[] }>('/api/instances'); }
  permissions(botId: string, patch: BotPermissionsPatch) {
    return this.request<{ bot: Bot }>(`/api/bots/${routeId(botId)}/permissions`, 'PATCH', patch);
  }
  search(q: string) { return this.request<{ hits: SearchHit[] }>(`/api/search?${new URLSearchParams({ q, limit: '40' })}`); }
  send(d: Destination, text: string, sendId: string, mode: 'chat' | 'goal' = 'chat') {
    return this.request(`${destinationPath(d)}/messages`, 'POST', { text, threadId: d.threadId, sendId, ...(d.kind === 'groups' ? { mode } : {}) });
  }
  stop(d: Destination) { return this.request(`${destinationPath(d)}/interrupt`, 'POST', { threadId: d.threadId }); }
  read(d: Destination) { return this.request(`${destinationPath(d)}/read`, 'POST', { threadId: d.threadId }); }
  respond(thread: string, requestId: string, behavior: 'allow' | 'deny' | 'answer', message?: string, reviewedSha256?: string) {
    return this.request(`/api/threads/${routeId(thread)}/respond`, 'POST', { requestId, behavior, message, reviewedSha256 });
  }
  card(d: Destination, messageId: string, chosen: string) {
    return this.request(`${destinationPath(d)}/cards/${routeId(messageId)}`, 'PATCH', { answered: chosen, threadId: d.threadId });
  }
  createTask(d: Destination, title: string) { return this.request<{ bot?: Bot; group?: Group }>(`${destinationPath(d)}/tasks`, 'POST', { title }); }
  task(d: Destination, method: 'POST' | 'PATCH' | 'DELETE', patch?: unknown) { return this.request(`${destinationPath(d)}/tasks/${routeId(d.threadId)}`, method, patch); }
  cancelQueued(d: Destination, queueId: string) { return this.request(`${destinationPath(d)}/queue/${routeId(queueId)}`, 'DELETE', { threadId: d.threadId }); }
  reaction(d: Destination, messageId: string, emoji: string) { return this.request(`/api/threads/${routeId(d.threadId)}/messages/${routeId(messageId)}/reactions`, 'POST', { emoji }); }
  edit(d: Destination, messageId: string, text: string) { return this.request(`${destinationPath(d)}/messages/${routeId(messageId)}/edit`, 'POST', { text, threadId: d.threadId }); }
  async upload(bytes: Uint8Array, name: string, mime: string, uploadId: string): Promise<Upload> {
    const image = /^image\/(png|jpeg|gif|webp)$/.test(mime);
    if (bytes.byteLength > (image ? 10 : 25) * 1024 * 1024) throw new Error(`Choose ${image ? 'an image under 10' : 'a file under 25'} MB.`);
    const query = new URLSearchParams({ name, uploadId });
    const response = await this.response(`/api/${image ? 'attachments' : 'files'}?${query}`, { method: 'POST', headers: { 'Content-Type': mime }, body: bytes as BodyInit });
    return JSON.parse(new TextDecoder().decode(await response.arrayBuffer())) as Upload;
  }
  imageSource(path: string) {
    if (!/^\/api\/(attachments\/[\w-]+\.(png|jpe?g|gif|webp)|threads\/[\w-]+\/messages\/[\w-]+\/image)$/i.test(path)) throw new Error('Invalid image path.');
    return { uri: this.connection.endpoint.url + path, headers: { Authorization: `Bearer ${this.token}` } };
  }
}

export async function pair(invite: Invite, deviceName: string, attemptId: string, fetcher: Fetcher = globalThis.fetch): Promise<{ connection: Connection; token: string }> {
  let last: unknown = new Error('No route to this computer.');
  for (const endpoint of invite.endpoints) {
    const connection: Connection = { id: attemptId, name: invite.name, endpoint, endpoints: invite.endpoints, server: invite.server };
    const client = new Client(connection, '', fetcher);
    try {
      const body = invite.server ? { code: invite.credential, label: deviceName, attemptId } : {
        [/^\d{6}$/.test(invite.credential) ? 'code' : 'credential']: invite.credential, deviceName, pairRequestId: attemptId,
      };
      const result = await client.request<{ token: string; serverName?: string; device?: { id: string }; session?: { scopes: string[] }; environment?: { label: string } }>(invite.server ? '/api/auth/pair' : '/api/pair', 'POST', body);
      if (!result.token) throw new Error('The computer did not return a device token.');
      return { connection: { ...connection, name: result.serverName ?? result.environment?.label ?? invite.name, scopes: result.session?.scopes, deviceId: result.device?.id }, token: result.token };
    } catch (error) {
      if (error instanceof APIError) throw error; // Never spray rejected credentials across routes.
      last = error;
    }
  }
  throw last;
}

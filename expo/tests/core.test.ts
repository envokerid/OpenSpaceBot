import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { endpoint, parseInvite, manualInvite, automaticEndpoints } from '../src/core/pairing.ts';
import { Client, APIError, pair } from '../src/core/client.ts';
import { SSEParser, stream } from '../src/core/sse.ts';
import { fold, hydrate, initialState, visibleMessages } from '../src/core/store.ts';
import { Session } from '../src/core/session.ts';
import type { Connection, Fleet, Frame, Message } from '../src/core/types.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../ios/Tests/CompanionCoreTests/Fixtures/${name}.json`, import.meta.url), 'utf8'));
const connection: Connection = { id: 'test', name: 'Test', endpoint: endpoint('127.0.0.1:8810'), endpoints: [endpoint('127.0.0.1:8810')], server: false };

test('goal sends opt into group coordination without changing direct bot payloads', async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = new Client(connection, 'fixture', async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body))); return Response.json({});
  });
  const group = { kind: 'groups' as const, id: 'group', threadId: 'thread' };
  await client.send(group, 'Finish this', 'goal-receipt', 'goal');
  await client.send(group, 'Hello', 'chat-receipt');
  await client.send({ ...group, kind: 'bots' }, 'Hello', 'bot-receipt');
  assert.deepEqual(bodies[0], { text: 'Finish this', threadId: 'thread', sendId: 'goal-receipt', mode: 'goal' });
  assert.equal(bodies[1].mode, 'chat');
  assert.equal('mode' in bodies[2], false);
});

test('manual LAN, explicit HTTPS and IPv6 preserve their authorities', () => {
  assert.equal(endpoint('desktop.local').url, 'http://desktop.local:8810');
  assert.equal(endpoint('https://desktop.example').url, 'https://desktop.example');
  assert.equal(endpoint('[::1]:8810').url, 'http://[::1]:8810');
  assert.equal(manualInvite('https://desktop.example', 'ABCD-EFGH-JKLM').server, true);
  for (const bad of ['https://u:p@host', 'https://host/path', 'https://host?code=1', 'ftp://host', 'host:0', 'https://host/#x', 'host\\evil']) {
    assert.throws(() => endpoint(bad), undefined, bad);
  }
});

test('QR decoding rejects duplicate parameters and malformed endpoint metadata', () => {
  assert.throws(() => parseInvite('openmausbot://pair?address=host&code=123456&code=654321'));
  assert.throws(() => parseInvite('openmausbot://pair?address=host&code=123456&endpoints=bad'));
  const link = `openmausbot://pair?address=host&token=omb_pair_${'A'.repeat(43)}`;
  assert.equal(parseInvite(link).credential, `omb_pair_${'A'.repeat(43)}`);
  assert.equal(parseInvite('https://server.test/pair#code=ABCD-EFGH-JKLM').endpoints[0].url, 'https://server.test');
});

test('route consent never permits HTTPS to LAN downgrade or another local origin', () => {
  const secure = endpoint('https://computer.test'); const lan = endpoint('192.168.1.2'); const other = endpoint('192.168.1.3'); const tail = endpoint('computer.tail.ts.net');
  assert.deepEqual(automaticEndpoints([secure, lan, tail]), [secure, tail]);
  assert.deepEqual(automaticEndpoints([lan, other, secure]), [lan, secure]);
  assert.throws(() => endpoint('http://computer.test', 'hosted'));
  assert.throws(() => endpoint('http://computer.test', 'tailnet'));
});

test('SSE decodes every byte boundary, CRLF, comments, multiline data and unknown frames', () => {
  const text = ': heartbeat\r\n\r\ndata: {"kind":"hello",\r\ndata: "cursor":"stream:4","resumed":false}\r\n\r\ndata: {"kind":"future","seq":5}\n\n';
  const parser = new SSEParser(); const frames: Frame[] = [];
  for (const char of text) frames.push(...parser.push(char));
  assert.equal(frames.length, 2); assert.equal(frames[0].kind, 'hello'); assert.equal(frames[1].kind, 'future');
});

test('captured native fixtures hydrate and replay without duplicating messages', () => {
  const fleet = fixture('bots-paged') as Fleet;
  let state = hydrate(initialState(), fleet);
  state = fold(state, fixture('sse-hello'));
  const message = fleet.bots[0].messages[0];
  state = fold(state, { kind: 'message.patch', message: { ...message, text: 'patched' }, threadId: fleet.bots[0].threadId, seq: 9 });
  assert.equal(state.pages[fleet.bots[0].threadId].messages.length, fleet.bots[0].messages.length);
  assert.equal(state.pages[fleet.bots[0].threadId].messages[0].text, 'patched');
  assert.match(state.cursor!, /:9$/);
});

test('home hydration finishes for an empty fleet and survives reconnection', async () => {
  const client = new Client(connection, 'test-token', async () => new Response(JSON.stringify({ bots: [], groups: [] })));
  const session = new Session(client);
  assert.equal(session.snapshot().hydrated, false);
  await session.refresh();
  assert.equal(session.snapshot().hydrated, true);
  assert.deepEqual(session.snapshot().bots, []);
  assert.deepEqual(session.snapshot().groups, []);
  const reconnected = fold({ ...session.snapshot(), status: 'connecting' }, { kind: 'hello', cursor: 'stream:0', resumed: true });
  assert.equal(reconnected.hydrated, true);
  const freshSession = new Session(client);
  assert.equal(freshSession.snapshot().hydrated, false);
});

test('branch traversal excludes siblings and terminates cycles', () => {
  const m = (id: string, parentId: string | null): Message => ({ id, parentId, at: 1, kind: 'text', role: 'bot' });
  assert.deepEqual(visibleMessages({ messages: [m('a', null), m('b', 'a'), m('c', 'a')], activeLeafId: 'c' }).map(x => x.id), ['a', 'c']);
  assert.equal(visibleMessages({ messages: [m('a', 'b'), m('b', 'a')], activeLeafId: 'a' }).length, 2);
});

test('send, Stop, approval, read and model changes pin the chosen thread', async () => {
  const requests: { path: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const client = new Client(connection, 'test-token', async (url, init) => {
    requests.push({ path: String(url), body: JSON.parse(String(init?.body ?? '{}')), headers: new Headers(init?.headers) });
    assert.equal(init?.redirect, 'error'); return new Response('{}');
  });
  const d = { kind: 'bots' as const, id: 'bot', threadId: 'sibling' };
  await client.send(d, 'Hello', 'stable-send-id-123'); await client.stop(d); await client.read(d);
  await client.respond(d.threadId, 'request', 'answer', 'Yes');
  await client.task(d, 'PATCH', { modelSelection: { instanceId: 'claude', model: 'test' } });
  assert.deepEqual(requests.slice(0, 3).map(r => r.body.threadId), ['sibling', 'sibling', 'sibling']);
  assert.match(requests[3].path, /threads\/sibling\/respond$/);
  assert.match(requests[4].path, /bots\/bot\/tasks\/sibling$/);
  assert.ok(requests.every(r => r.headers.get('authorization') === 'Bearer test-token'));
  assert.throws(() => client.imageSource('https://attacker.test/image.png'));
  await assert.rejects(() => client.request('/api/../secret'));
});

test('pair exchanges captured responses without bearer and reuses attempt identity', async () => {
  const invites = [manualInvite('computer.local', '123456'), manualInvite('https://server.test', 'ABCD-EFGH-JKLM')];
  for (const invite of invites) {
    const result = await pair(invite, 'Fixture phone', 'same-attempt', async (url, init) => {
      assert.equal(new Headers(init?.headers).has('authorization'), false);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.attemptId ?? body.pairRequestId, 'same-attempt');
      assert.equal(new URL(String(url)).pathname, invite.server ? '/api/auth/pair' : '/api/pair');
      return Response.json(fixture(invite.server ? 'auth-pair-response' : 'pair-response'));
    });
    assert.ok(result.token); assert.equal(result.connection.server, invite.server);
  }
});

test('a rejected pairing is not retried at a second endpoint', async () => {
  let calls = 0;
  await assert.rejects(() => pair({ ...manualInvite('computer.local', '123456'), endpoints: [endpoint('computer.local'), endpoint('https://remote.test')] }, 'Test', 'attempt', async () => { calls++; return Response.json({ error: 'Expired code' }, { status: 401 }); }), APIError);
  assert.equal(calls, 1);
});

test('real byte stream detects early closure and sends cursor with screens off', async () => {
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-token');
    assert.match(req.url!, /screens=off/); assert.match(req.url!, /since=s%3A1/);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: {"kind":"hello","cursor":"s:2","resumed":true}\n\n');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing address');
  const client = new Client({ ...connection, endpoint: endpoint(`127.0.0.1:${address.port}`) }, 'test-token');
  const frames: Frame[] = [];
  try { await assert.rejects(() => stream(client, 's:1', false, new AbortController().signal, frame => { frames.push(frame); }), /Connection closed/); assert.equal(frames.length, 1); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('cold hydration includes waiting sibling approvals and ignores a stopped snapshot', async () => {
  const fleet = fixture('bots-paged') as Fleet;
  fleet.bots[0].tasks = [...(fleet.bots[0].tasks ?? []), { threadId: 'waiting-sibling', title: 'Waiting', createdAt: 1, activity: 'waiting-on-you' }];
  const paths: string[] = [];
  const session = new Session(new Client(connection, 'test-token', async url => { paths.push(String(url)); return Response.json(String(url).includes('/threads/') ? fixture('thread-page') : fleet); }));
  await session.refresh(); assert.ok(paths.some(p => p.includes('waiting-sibling'))); assert.ok(session.state.pages['waiting-sibling']);
  const old = session.state;
  const pending = session.refresh(); session.stop(); await pending;
  assert.equal(session.state, old);
});

test('a slow refresh cannot erase a live message received after its snapshot', async () => {
  const fleet = fixture('bots-paged') as Fleet;
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  let release: (() => void) | undefined;
  let defer = false;
  const session = new Session(new Client(connection, 'token', async (url, init) => {
    if (String(url).includes('/events')) return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      streamController = controller;
      controller.enqueue(new TextEncoder().encode('data: {"kind":"hello","cursor":"race:1","resumed":false}\n\n'));
      init?.signal?.addEventListener('abort', () => controller.close(), { once: true });
    } }), { headers: { 'content-type': 'text/event-stream' } });
    if (defer) await new Promise<void>(resolve => { release = resolve; });
    return Response.json(fleet);
  }));
  const wait = async (predicate: () => boolean) => { for (let n = 0; !predicate(); n++) { assert.ok(n < 100, 'condition timed out'); await new Promise(resolve => setTimeout(resolve, 5)); } };
  session.start();
  try {
    await wait(() => session.state.status === 'connected');
    defer = true; const refresh = session.refresh(); await wait(() => !!release);
    const message: Message = { id: 'newer-message', role: 'bot', kind: 'text', at: Date.now(), text: 'Newer than snapshot' };
    streamController!.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ kind: 'message', threadId: fleet.bots[0].threadId, message, seq: 2 })}\n\n`));
    await wait(() => session.state.pages[fleet.bots[0].threadId].messages.some(m => m.id === message.id));
    release!(); await refresh;
    assert.ok(session.state.pages[fleet.bots[0].threadId].messages.some(m => m.id === message.id));
    assert.equal(session.state.cursor, 'race:2');
  } finally { session.stop(); }
});

test('closing a screen after session teardown does not reopen the stream', () => {
  let requests = 0;
  const session = new Session(new Client(connection, 'token', async () => { requests++; throw new Error('Should not connect'); }));
  session.stop(); session.setScreens(false);
  assert.equal(requests, 0);
});

test('HTTP JSON decodes UTF-8 even when native Response.text uses Latin-1', async () => {
  const NativeResponse = globalThis.Response;
  // React Native's whatwg-fetch response constructed from ArrayBuffer uses this
  // legacy text conversion. Guard the path used after a native fetch completes.
  class LegacyResponse extends NativeResponse {
    async text() { return String.fromCharCode(...new Uint8Array(await this.arrayBuffer())); }
  }
  globalThis.Response = LegacyResponse;
  try {
    const expected = { title: 'Grüße · Bash ×1 — 東京 👋' };
    const client = new Client(connection, 'fixture-token', async () => new NativeResponse(JSON.stringify(expected)));
    assert.deepEqual(await client.request('/api/fixture'), expected);
  } finally { globalThis.Response = NativeResponse; }
});

test('folders preserve saved order and search includes closed conversation titles', async () => {
  const { threadGroups } = await import('../src/core/threads.ts');
  const bot = { ...fixture('bots-paged').bots[0], threadId: 'active', projects: [{ id: 'p', name: 'Launch plans', emoji: '🚀', createdAt: 1 }], tasks: [
    { threadId: 'active', title: 'Open', createdAt: 1 },
    { threadId: 'closed', title: 'Old plan', createdAt: 2, projectId: 'p', closedBy: { name: 'Helper' } },
    { threadId: 'waiting', title: 'Approval', createdAt: 3, projectId: 'p', activity: 'waiting-on-you', archivedAt: 0 },
    { threadId: 'internal', title: 'Detached run', createdAt: 4, routineRunId: 'run' },
  ] };
  assert.deepEqual(threadGroups(bot).map(g => g.tasks.map(t => t.threadId)), [['waiting'],['active']]);
  assert.deepEqual(threadGroups(bot,'active','Launch').flatMap(g => g.tasks.map(t => t.threadId)), ['closed','waiting']);
  assert.deepEqual(threadGroups(bot,'active','Old plan').flatMap(g => g.tasks.map(t => t.threadId)), ['closed']);
});

test('reduced activity keeps failures visible and never merges steps across messages', async () => {
  const { transcriptRows } = await import('../src/core/transcript.ts');
  const activity = (id: string, ok: boolean) => ({ id, at: 1, role: 'bot', kind: 'activity', tool: { name: 'Bash', ok } }) as Message;
  const text = { id: 'reply', at: 2, role: 'bot', kind: 'text', text: 'Done' } as Message;
  const messages = [activity('a',true),activity('b',true),activity('failure',false),text,activity('c',true)];
  const rows = transcriptRows(messages,'summary');
  assert.deepEqual(rows.map(r => r.id),['run.a','failure','reply','run.c']);
  assert.equal(rows[0].activityRun?.length,2);
  assert.equal(messages[0].id,'a');
  assert.deepEqual(transcriptRows(messages,'off'),[text]);
});

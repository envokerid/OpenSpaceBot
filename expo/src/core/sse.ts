import type { Frame } from './types.ts';
import { APIError, type Client } from './client.ts';

// Raw SSE framing: chunk and CRLF boundaries need not line up with events.
export class SSEParser {
  private buffer = '';
  push(chunk: string): Frame[] {
    this.buffer += chunk;
    if (this.buffer.length > 8 * 1024 * 1024) throw new Error('Event frame exceeds the supported size.');
    const frames: Frame[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const event = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
      if (!data) continue;
      const frame = JSON.parse(data) as Frame;
      if (frame && typeof frame.kind === 'string') frames.push(frame);
    }
    return frames;
  }
}

export async function stream(client: Client, cursor: string | undefined, screens: boolean, signal: AbortSignal, onFrame: (frame: Frame) => Promise<void> | void) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  let watchdog = setTimeout(abort, 90_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const query = new URLSearchParams({ screens: screens ? 'on' : 'off', ...(cursor ? { since: cursor } : {}) });
    const response = await client.fetcher(`${client.connection.endpoint.url}/api/events?${query}`, { signal: controller.signal, redirect: 'error', headers: { Authorization: `Bearer ${client.token}`, Accept: 'text/event-stream' } });
    if (!response.ok) throw new APIError(response.status, response.status === 401 ? 'This device was revoked. Pair it again.' : `Event stream returned ${response.status}.`);
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('The computer did not open an event stream.');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SSEParser();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error('Connection closed. Reconnecting…');
      clearTimeout(watchdog); watchdog = setTimeout(abort, 90_000);
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) await onFrame(frame);
    }
  } finally {
    clearTimeout(watchdog); controller.abort(); signal.removeEventListener('abort', abort);
    await reader?.cancel().catch(() => {});
  }
}

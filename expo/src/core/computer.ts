import { routeId, type Client } from './client.ts';
import { visibleMessages, type State } from './store.ts';

export function computerPreview(state: State, botId: string, threadId: string) {
  const bot = state.bots.find(item => item.id === botId);
  const task = bot?.tasks?.find(item => item.threadId === threadId);
  const surface = task?.surface ?? bot?.computer;
  const saved = visibleMessages(state.pages[threadId]).findLast(message => message.kind === 'screen');
  return {
    bot,
    busy: task?.busy ?? (bot?.threadId === threadId && bot?.busy) ?? false,
    cloud: surface === 'cloud',
    live: state.screens[threadId],
    savedPath: saved ? `/api/threads/${routeId(threadId)}/messages/${routeId(saved.id)}/image` : undefined,
  };
}

export async function captureComputer(client: Client, botId: string, threadId: string, signal: AbortSignal) {
  const path = `/api/bots/${routeId(botId)}`;
  const query = `?threadId=${routeId(threadId)}`;
  // The server resolves Auto and the selected task's surface using the same
  // rules as the desktop. Profile defaults cannot identify an Auto VM.
  const status = await client.response(`${path}/computer${query}`, { signal });
  const { surface } = JSON.parse(new TextDecoder().decode(await status.arrayBuffer())) as { surface?: string };
  if (surface !== 'vm' && surface !== 'cloud') return { surface };
  const response = await client.response(`${path}/${surface === 'vm' ? 'local-computer' : 'computer'}/screenshot${query}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal,
  });
  const frame = JSON.parse(new TextDecoder().decode(await response.arrayBuffer())) as { image?: string; png?: string; format?: string };
  if (surface === 'vm') {
    if (!frame.image || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(frame.image)) throw new Error('The VM returned an invalid screen image.');
    return { surface, uri: frame.image };
  }
  if (!frame.png || !frame.format || !['png', 'jpeg', 'webp'].includes(frame.format)) throw new Error('The computer returned an invalid screen image.');
  return { surface, uri: `data:image/${frame.format};base64,${frame.png}` };
}

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

export async function captureComputer(client: Client, botId: string, threadId: string, signal: AbortSignal): Promise<{ surface?: string; uri?: string }> {
  const path = `/api/bots/${routeId(botId)}`;
  const query = `?threadId=${routeId(threadId)}`;
  // The server resolves Auto and the selected task's surface using the same
  // rules as the desktop. Profile defaults cannot identify an Auto VM.
  const status = await client.response(`${path}/computer${query}`, { signal });
  const { surface } = JSON.parse(new TextDecoder().decode(await status.arrayBuffer())) as { surface?: string };
  if (surface !== 'vm' && surface !== 'cloud') return { surface };
  return captureSurface(client, botId, threadId, surface, signal);
}

// Takeover already resolves the VM. The screenshot endpoint rechecks the
// selected conversation's surface, so a discovery round trip per frame is redundant.
export function captureVmFrame(client: Client, botId: string, threadId: string, signal: AbortSignal) {
  return captureSurface(client, botId, threadId, 'vm', signal);
}

async function captureSurface(client: Client, botId: string, threadId: string, surface: 'vm' | 'cloud', signal: AbortSignal) {
  const path = `/api/bots/${routeId(botId)}`;
  const query = `?threadId=${routeId(threadId)}`;
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

export type { MobileVmInput } from '../../../shared/mobile-vm.ts';
export function vmControl(client: Client, botId: string, threadId: string, controlLeaseId: string, action: 'take' | 'renew' | 'release' | 'input', input?: import('../../../shared/mobile-vm.ts').MobileVmInput) {
  return client.request<{ held: boolean }>(`/api/bots/${routeId(botId)}/local-computer/control?threadId=${routeId(threadId)}`, 'POST', { action, controlLeaseId, ...(input ? { input } : {}) }, 30_000);
}

/** Map a touch through contain-mode letterboxing; black bars never click. */
export function computerPoint(x: number, y: number, width: number, height: number, imageWidth: number, imageHeight: number) {
  if (Math.min(width, height, imageWidth, imageHeight) <= 0) return undefined;
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const px = (x - (width - imageWidth * scale) / 2) / scale;
  const py = (y - (height - imageHeight * scale) / 2) / scale;
  if (px < 0 || py < 0 || px >= imageWidth || py >= imageHeight) return undefined;
  return { x: Math.floor(px), y: Math.floor(py) };
}

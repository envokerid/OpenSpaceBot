import type { WireMessage } from './wire.ts';

/** End-of-turn screen rows are fallback previews. An image delivered in the
 * assistant's reply already fills that role. Keep the stored rows intact and
 * make this decision from the active transcript before display windowing. */
export function redundantScreenIds(messages: readonly WireMessage[]): Set<string> {
  const hidden = new Set<string>();
  let reply: WireMessage | undefined;
  for (const message of messages) {
    if (message.role === 'user') {
      reply = undefined;
      continue;
    }
    if (reply && ((message.turnId && message.turnId !== reply.turnId)
      || (message.from?.botId && message.from.botId !== reply.from?.botId))) {
      reply = undefined;
    }
    if (message.kind === 'text') reply = message;
    if (message.kind === 'screen') {
      if (reply?.attachments?.some(attachment => attachment.kind === 'image')) hidden.add(message.id);
      reply = undefined;
    }
  }
  return hidden;
}

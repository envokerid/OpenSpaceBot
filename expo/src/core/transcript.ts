import { peerMessagesWithReceipts } from '../../../shared/peer-message.ts';
import { redundantScreenIds } from '../../../shared/transcript-screens.ts';
import type { Message } from './types.ts';
export type TranscriptMessage = Message & { activityRun?: Message[] };
export const isConversationNotice = (message: Message): boolean =>
 message.kind === 'activity' && !!(message.comm || message.threadRef);
export function transcriptRows(messages: Message[], detail: 'off' | 'summary' | 'full' = 'full', groupChat = false): TranscriptMessage[] {
 const receivedPeers = peerMessagesWithReceipts(messages);
 const hiddenScreens = redundantScreenIds(messages);
 messages = messages.filter(message => !hiddenScreens.has(message.id) && !receivedPeers.has(message.id));
 // Keep group requests visible even for Goal messages or pages without
 // their goal receipt.
 messages = messages.filter(message => !(!groupChat && message.role === 'user' && message.channelMode === 'goal') && message.kind !== 'digest' && !(
  message.role === 'bot' && message.kind === 'activity' && message.tool?.ok === true
  && /^.+?'s recent-work brief covers \d+ private chats? with you$/s.test(message.tool.name)
 ));
 if (detail === 'full') return messages;
 if (detail === 'off') return messages.filter(m => (m.kind !== 'activity' && !m.tool) || !!m.card || isConversationNotice(m) || !!m.tool?.name.startsWith('error:'));
 const rows: TranscriptMessage[] = [];
 for (const message of messages) {
  if (message.kind === 'activity' && message.tool?.ok !== false && !isConversationNotice(message)) {
   const previous = rows.at(-1);
   if (previous?.activityRun) previous.activityRun.push(message);
   else rows.push({ ...message, id: `run.${message.id}`, activityRun: [message] });
  } else rows.push(message);
 }
 return rows;
}

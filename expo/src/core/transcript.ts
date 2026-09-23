import type { Message } from './types.ts';
export type TranscriptMessage = Message & { activityRun?: Message[] };
export function transcriptRows(messages: Message[], detail: 'off' | 'summary' | 'full' = 'full', groupChat = false, showDiscussionCards = true): TranscriptMessage[] {
 // Keep group requests visible even for legacy Goal messages or pages without
 // their discussion card.
 messages = messages.filter(message => (showDiscussionCards || !groupChat || !(message.kind === 'goal.run' && message.goalRun?.election))
  && !(!groupChat && message.role === 'user' && message.channelMode === 'goal') && message.kind !== 'digest' && !(
  message.role === 'bot' && message.kind === 'activity' && message.tool?.ok === true
  && /^.+?'s recent-work brief covers \d+ private chats? with you$/s.test(message.tool.name)
 ));
 if (detail === 'full') return messages;
 if (detail === 'off') return messages.filter(m => m.kind !== 'activity');
 const rows: TranscriptMessage[] = [];
 for (const message of messages) {
  if (message.kind === 'activity' && message.tool?.ok !== false) {
   const previous = rows.at(-1);
   if (previous?.activityRun) previous.activityRun.push(message);
   else rows.push({ ...message, id: `run.${message.id}`, activityRun: [message] });
  } else rows.push(message);
 }
 return rows;
}

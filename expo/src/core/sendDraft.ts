import type { Draft } from './types.ts';

// The composer stays editable while the request is in flight. Only clear the
// exact submitted draft; later edits belong to the next message.
export function settleSendDraft(current: Draft, submitted: Draft, sendId: string, failed = false): Draft {
  const unchanged = current.text === submitted.text && current.files.length === submitted.files.length
    && current.files.every((file, index) => file.path === submitted.files[index].path);
  if (!failed && unchanged) return { text: '', files: [] };
  return { ...current, sending: false, sendId: failed && unchanged ? sendId : undefined };
}

// A user-role line that another bot wrote.
//
// ask_bot, delegate_bot and start_thread all deliver a peer's words into a
// bot's own conversation as a user-role message: that is the turn the model
// answers, and the server stores it that way. The author rides along on
// Message.peerAsk, and the text opens with a bracketed provenance note for
// the model ("[Message from @Chief, another bot in this OpenMausBot
// workspace — …]"). A renderer keyed on role alone shows that line on the
// person's side of the chat, as if they had said it — which is the bug
// this module exists to prevent. The parse is the client twin of
// server/peer-provenance.ts: the field wins; rows stored before it existed
// still open with the note, so the note is read as the fallback.
import type { WireMessage as Message } from "./wire.ts";

export type PeerDelivery = "ask_bot" | "delegate_bot" | "start_thread";

export interface PeerLine {
  /** The bot that wrote it; absent on rows older than Message.peerAsk. */
  botId?: string;
  name: string;
  delivery: PeerDelivery;
  /** The words themselves, with the provenance note removed. */
  body: string;
  unattended?: boolean;
}

// The note is one bracketed line with a fixed opening; the wording after
// the workspace clause varies by delivery and is not needed here.
const PROVENANCE_NOTE =
  /^\[(Message from|Delegated by|Thread opened by) @([^,\]]+), another bot in this OpenMausBot workspace[^\]]*\]\s*/;

const DELIVERY: Record<string, PeerDelivery> = {
  "Message from": "ask_bot",
  "Delegated by": "delegate_bot",
  "Thread opened by": "start_thread",
};

/** Who wrote a user-role line, when it was not the person; null when it was. */
export function peerLine(message: Pick<Message, "role" | "text" | "peerAsk" | "roomRequest" | "from">): PeerLine | null {
  // Group handoffs copied into the recipient's direct thread arrive as
  // bot-role request rows. Results and ordinary group speech stay messages.
  if (message.role === "bot" && message.roomRequest?.phase === "request" && message.from) {
    return { botId: message.from.botId, name: message.from.name, delivery: "ask_bot", body: message.text ?? "" };
  }
  if (message.role !== "user") return null;
  const text = message.text ?? "";
  const note = PROVENANCE_NOTE.exec(text);
  const name = message.peerAsk?.name ?? note?.[2]?.trim();
  if (!name) return null;
  return {
    botId: message.peerAsk?.botId,
    name,
    delivery: (note && DELIVERY[note[1]]) || "ask_bot",
    body: note ? text.slice(note[0].length) : text,
    ...(message.peerAsk?.unattended ? { unattended: true } : {}),
  };
}

/** Avoid a second notice when the harness already wrote an incoming receipt.
 * Match each receipt once, inside the current exchange; outgoing receipts and
 * receipts for a different sender must never hide an incoming request. */
export function peerMessagesWithReceipts(messages: readonly Message[]): Set<string> {
  const hidden = new Set<string>();
  let receipts: Message[] = [];
  for (const message of messages) {
    const peer = peerLine(message);
    if (peer) {
      const index = receipts.findIndex(receipt => {
        const sender = /^Message from @(.+)$/.exec(receipt.tool?.name ?? '')?.[1];
        return sender && (peer.botId && receipt.comm?.withBotId
          ? peer.botId === receipt.comm.withBotId : sender === peer.name);
      });
      if (index >= 0) {
        hidden.add(message.id);
        receipts.splice(index, 1);
      }
    } else if (message.kind === 'text' || message.role === 'user') {
      receipts = [];
    } else if (message.kind === 'activity' && message.comm && message.tool?.name.startsWith('Message from @')) {
      receipts.push(message);
    }
  }
  return hidden;
}

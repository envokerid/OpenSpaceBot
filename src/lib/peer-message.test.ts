import { describe, expect, it } from "vitest";

import { peerLine, peerMessagesWithReceipts } from "./peer-message";

const NOTE = (opening: string, name: string, rest: string) =>
  `[${opening} @${name}, another bot in this OpenMausBot workspace${rest}]`;

describe("peerLine", () => {
  it("is null for the person's own line and for bot lines", () => {
    expect(peerLine({ role: "user", text: "hi" })).toBeNull();
    expect(peerLine({ role: "bot", text: NOTE("Message from", "Chief", " — x") })).toBeNull();
  });

  it("recognizes room requests copied into a bot thread without hiding results or group replies", () => {
    const message = { role: "bot" as const, text: "Internal request", from: { botId: "chief", name: "Chief", color: "blue" }, roomRequest: { id: "request", phase: "request" as const } };
    expect(peerLine(message)).toMatchObject({ botId: "chief", name: "Chief", body: "Internal request" });
    expect(peerLine({ ...message, roomRequest: { id: "request", phase: "result" } })).toBeNull();
    expect(peerLine({ ...message, roomRequest: undefined })).toBeNull();
  });

  it("reads the author off the field and strips the note", () => {
    const text = `${NOTE("Message from", "Chief", " — not from your user. @Chief is waiting on your answer, so reply to them.")}\n\nWhich database?`;
    expect(peerLine({ role: "user", text, peerAsk: { botId: "b1", name: "Chief" } })).toEqual({
      botId: "b1",
      name: "Chief",
      delivery: "ask_bot",
      body: "Which database?",
    });
  });

  it("falls back to the note on rows stored before the field existed", () => {
    const text = `${NOTE("Delegated by", "Chief", ". Do the work and reply directly.")}\n\nWrite the summary.\n\n[Reason: followup]`;
    expect(peerLine({ role: "user", text })).toEqual({
      name: "Chief",
      delivery: "delegate_bot",
      body: "Write the summary.\n\n[Reason: followup]",
    });
    expect(peerLine({ role: "user", text: `${NOTE("Thread opened by", "Pam", " — x")}\n\nJob.` })?.delivery).toBe(
      "start_thread",
    );
  });

  it("keeps the field's author when the text has no note, and carries unattended", () => {
    expect(peerLine({ role: "user", text: "plain", peerAsk: { botId: "b1", name: "Scout", unattended: true } })).toEqual({
      botId: "b1",
      name: "Scout",
      delivery: "ask_bot",
      body: "plain",
      unattended: true,
    });
  });
});


describe("incoming receipt matching", () => {
  const receipt = { id: "receipt", role: "bot" as const, kind: "activity" as const, at: 1,
    tool: { name: "Message from @Chief" }, comm: { groupId: "pair", withBotId: "chief", withName: "Chief", withColor: "blue" } };
  const request = { id: "request", role: "user" as const, kind: "text" as const, at: 2,
    peerAsk: { botId: "chief", name: "Renamed Chief" }, text: "Internal instructions" };
  it("matches sender IDs and consumes each receipt only once", () => {
    expect([...peerMessagesWithReceipts([receipt, request, { ...request, id: "next" }])]).toEqual(["request"]);
  });
  it("keeps requests when the receipt is hidden, belongs to someone else, or is from an earlier exchange", () => {
    expect(peerMessagesWithReceipts([{ ...receipt, comm: undefined }, request]).size).toBe(0);
    expect(peerMessagesWithReceipts([receipt, { ...request, peerAsk: { botId: "other", name: "Other" } }]).size).toBe(0);
    expect(peerMessagesWithReceipts([receipt, { id: "person", role: "user", kind: "text", at: 2, text: "Hello" }, request]).size).toBe(0);
  });
});

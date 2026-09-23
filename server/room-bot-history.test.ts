import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { ProviderAdapter, RuntimeEvent } from "./contracts.ts";
import { RoomBotHistories } from "./room-bot-history.ts";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "omb-room-history-"));
  directories.push(root);
  return { root, histories: new RoomBotHistories(root), adapter: { capabilities: {} } as ProviderAdapter };
};
const event = (value: object) => value as RuntimeEvent;

it("continues one bot's proposals, votes, tool records and replies across reloads and incoming messages", () => {
  const { root, histories, adapter } = setup();
  const proposal = histories.begin("room", "A", "provider/model", adapter, "Human: first request. Propose.");
  proposal.observe(event({ type: "session.started", sessionId: "native-A" }));
  proposal.finish(true, '{"candidate":"A","reason":"I can answer"}');
  const vote = new RoomBotHistories(root).begin("room", "A", "provider/model", adapter, "All proposals. Vote.");
  expect(vote.input.resumeCursor).toBe("native-A");
  expect(vote.input.sessionReset).toBeUndefined();
  expect(vote.input.text).toBe("All proposals. Vote.");
  expect(vote.input.recoveryText).toContain("I can answer");
  vote.finish(true, '{"candidate":"A"}');
  const work = histories.begin("room", "A", "provider/model", adapter, "You were elected. Reply.");
  const prior = structuredClone(work.input.transcript!);
  work.observe(event({ type: "item.started", itemType: "tool", itemId: "call1", title: "read", input: "file.txt" }));
  work.observe(event({ type: "item.completed", itemType: "tool", itemId: "call1", ok: true, output: "Evidence from file" }));
  work.observe(event({ type: "item.completed", itemType: "assistant_text", text: "My public contribution" }));
  work.finish(true);
  const next = new RoomBotHistories(root).begin("room", "A", "provider/model", adapter, "Human: second request. Propose.");
  expect(next.input.resumeCursor).toBe("native-A");
  expect(next.input.transcript!.slice(0, prior.length)).toEqual(prior);
  expect(next.input.transcript!.slice(-3).map(entry => entry.text)).toEqual([
    "[Tool call call1] read\nfile.txt", "[Tool result call1; succeeded]\nEvidence from file", "My public contribution",
  ]);
  next.finish(true);
  for (const [room, bot] of [["room", "B"], ["other-room", "A"]]) {
    const separate = histories.begin(room, bot, "provider/model", adapter, "First turn");
    expect(separate.input.resumeCursor).toBeUndefined();
    expect(separate.input.transcript).toEqual([]);
    separate.finish(true);
  }
});

it("keeps the native cursor after an interrupted ballot and blocks overlapping turns for that bot", () => {
  const { histories, adapter } = setup();
  const first = histories.begin("room", "A", "model", adapter, "First proposal");
  first.observe(event({ type: "session.started", sessionId: "retained" }));
  expect(() => histories.begin("room", "A", "model", adapter, "Overlapping vote")).toThrow("active turn");
  first.finish(false);
  const next = histories.begin("room", "A", "model", adapter, "A new human message changed the election");
  expect(next.input.resumeCursor).toBe("retained");
  expect(next.input.text).toContain("previous turn was interrupted");
  expect(next.input.transcript?.[0].text).toBe("First proposal");
  next.finish(true);
});

it("retains exact API tool messages and replays portable history when switching providers", () => {
  const { histories, adapter, root } = setup();
  adapter.capabilities.structuredHistory = true;
  const first = histories.begin("room", "A", "api-model", adapter, "Read a file");
  const messages = [
    { role: "user" as const, content: "Read a file" },
    { role: "assistant" as const, content: null, tool_calls: [{ id: "t1", type: "function" as const, function: { name: "read", arguments: "{}" } }], reasoning_content: "provider protocol" },
    { role: "tool" as const, tool_call_id: "t1", content: "File contents" },
    { role: "assistant" as const, content: "Done" },
  ];
  first.input.saveProviderHistory!({ format: "openai-chat", messages });
  first.observe(event({ type: "item.completed", itemType: "assistant_text", text: "Done" }));
  first.finish(true);
  const next = new RoomBotHistories(root).begin("room", "A", "api-model", adapter, "Vote");
  expect(next.input.providerHistory?.messages).toEqual(messages);
  expect(next.input.text).toBe("Vote");
  next.finish(true);
  const switched = histories.begin("room", "A", "different-provider", { capabilities: {} } as ProviderAdapter, "Continue");
  expect(switched.input.providerHistory).toBeUndefined();
  expect(switched.input.resumeCursor).toBeUndefined();
  expect(switched.input.text).toContain("Done");
  expect(switched.input.text).toContain("Vote");
  switched.finish(true);
});

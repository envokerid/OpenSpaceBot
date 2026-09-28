import { expect, it } from "vitest";
import { nativeCompletion, responsesBody } from "./transport.ts";
import type { NativeAccounts } from "./accounts.ts";

it("scopes encrypted reasoning replay to the originating provider", () => {
  const body = { messages: [{ role: "assistant", content: "text", reasoning_details: [{ type: "reasoning", encrypted_content: "opaque", openmaus_provider: "openai-codex", summary: [] }] }] };
  expect(JSON.stringify(responsesBody(body, "model", "openai-codex"))).toContain("opaque");
  expect(JSON.stringify(responsesBody(body, "model", "xai-oauth"))).not.toContain("opaque");
});
it.each([
  [{ type: "message_stop" }],
  [{ type: "message_start", message: {} }, { type: "message_stop" }],
  [{ type: "message_start", message: {} }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "call", name: "write", input: {} } }, { type: "message_delta", delta: { stop_reason: "tool_use" } }, { type: "message_stop" }],
])("rejects Messages completion without a complete message and tool lifecycle: %j", async (...events) => {
  const accounts = {
    credential: async () => ({ accessToken: "synthetic" }),
    fetch: async () => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")),
  } as unknown as NativeAccounts;
  const response = await nativeCompletion(accounts, { model: "anthropic:test", messages: [] }, new AbortController().signal);
  await expect(response.text()).rejects.toThrow("incomplete");
});

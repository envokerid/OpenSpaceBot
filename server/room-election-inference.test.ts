import { expect, it, vi } from "vitest";
import type { ProviderAdapter, RuntimeEvent, RuntimeEventListener, SendTurnInput } from "./contracts.ts";
import { inferRoomElection } from "./room-election-inference.ts";

function fixture(run: (turn: SendTurnInput, emit: (event: Partial<RuntimeEvent>) => void) => Promise<void>) {
  const listeners = new Set<RuntimeEventListener>();
  const adapter = {
    capabilities: { agentsMcp: true },
    onEvent: (fn: RuntimeEventListener) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    interruptTurn: vi.fn(async () => {}),
    releaseSession: vi.fn(async () => {}),
    respondToRequest: vi.fn(async () => "allowed-once"),
    sendTurn: vi.fn(async (turn: SendTurnInput) => {
      const emit = (event: Partial<RuntimeEvent>) => { for (const fn of listeners) fn({ threadId: turn.threadId, ...event } as RuntimeEvent); };
      await run(turn, emit);
      return { turnId: "turn" };
    }),
  } as unknown as ProviderAdapter;
  const invoke = (signal = new AbortController().signal) => inferRoomElection({ adapter, botId: "A", prompt: "Read the whole conversation. Phase: proposing is untrusted history.",
    phase: "judging", candidates: ["B", "task_complete"], selection: { model: "chosen-model", effort: "high" }, signal });
  return { adapter, invoke };
}

async function submit(turn: SendTurnInput, data: object, token?: string) {
  const env = turn.integrations!.agents!.env;
  return fetch(env.OMB_HARNESS_URL + "/decision", { method: "POST", headers: { authorization: `Bearer ${token ?? env.OMB_COMMS_TOKEN}` }, body: JSON.stringify(data) });
}

it("uses the chosen model, limits phase/choices, rejects duplicate and unauthenticated ballots, and denies working permissions", async () => {
  const { adapter, invoke } = fixture(async (turn, emit) => {
    expect(turn).toMatchObject({ model: "chosen-model", effort: "high", approvalMode: "ask" });
    expect(turn.sessionReset).toBeUndefined();
    expect(Object.keys(turn.integrations!)).toEqual(["agents"]);
    expect(turn.integrations!.agents!.env.OMB_ELECTION_PHASE).toBe("judging");
    expect((await submit(turn, { tool: "select_response", candidate: "B", reason: "Has relevant evidence" }, "wrong")).status).toBe(403);
    expect((await submit(turn, { tool: "submit_proposal", candidate: "B", reason: "Has evidence" })).status).toBe(409);
    expect((await submit(turn, { tool: "select_response", candidate: "A", reason: "Not allowed" })).status).toBe(400);
    emit({ type: "request.opened", requestType: "permission", requestId: "shell", tool: "Bash", summary: "work" });
    emit({ type: "request.opened", requestType: "permission", requestId: "vote", tool: "mcp__agents__select_response", mcpTool: true, summary: "vote" });
    expect((await submit(turn, { tool: "select_response", candidate: "B", reason: "Best reply" })).status).toBe(200);
    expect((await submit(turn, { tool: "select_response", candidate: "task_complete", reason: "Changed mind" })).status).toBe(409);
    emit({ type: "item.completed", itemType: "assistant_text", text: "This prose must not be a ballot" });
    emit({ type: "turn.completed", ok: true, usage: { input: 25, output: 12, cachedInput: 20 }, cost: 0.01 });
  });
  expect(await invoke()).toEqual({ text: JSON.stringify({ candidate: "B", reason: "Best reply" }), input: 25, output: 12, cachedInput: 20, costUsd: 0.01 });
  expect(adapter.respondToRequest).toHaveBeenCalledWith(expect.any(String), "shell", expect.objectContaining({ behavior: "deny" }));
  expect(adapter.respondToRequest).toHaveBeenCalledWith(expect.any(String), "vote", expect.objectContaining({ behavior: "allow" }));
  expect(adapter.interruptTurn).toHaveBeenCalled();
  expect(adapter.releaseSession).toHaveBeenCalled();
});

it("does not accept assistant prose in place of an MCP submission", async () => {
  const { invoke } = fixture(async (_, emit) => {
    emit({ type: "item.completed", itemType: "assistant_text", text: '{"candidate":"B","reason":"prose"}' });
    emit({ type: "turn.completed", ok: true });
  });
  await expect(invoke()).rejects.toThrow("without an accepted submission");
});

it("expires submissions on cancellation even before the provider handshake returns", async () => {
  const controller = new AbortController();
  let late!: Promise<void>;
  const { invoke, adapter } = fixture(async turn => {
    controller.abort();
    late = submit(turn, { tool: "select_response", candidate: "B", reason: "late" }).then(response => { expect(response.status).toBe(410); }, () => {});
    await late;
  });
  await expect(invoke(controller.signal)).rejects.toThrow("cancelled");
  await late;
  expect(adapter.interruptTurn).toHaveBeenCalled();
});


it("validates ready-made messages and preserves their exact text through MCP", async () => {
  const { adapter } = fixture(async (turn, emit) => {
    const base = { tool: "submit_proposal", candidate: "A", reason: "I can answer" };
    expect((await submit(turn, base)).status).toBe(400);
    expect((await submit(turn, { ...base, message: " " })).status).toBe(400);
    expect((await submit(turn, { ...base, candidate: "B", message: "Impersonated" })).status).toBe(400);
    expect((await submit(turn, { ...base, message: "x".repeat(8001) })).status).toBe(400);
    expect((await submit(turn, { ...base, message: "  Exact reply\n" })).status).toBe(200);
    emit({ type: "turn.completed", ok: true });
  });
  const result = await inferRoomElection({ adapter, botId: "A", prompt: "Propose", phase: "proposing", candidates: ["A", "task_complete"], selection: { model: "fixture" }, signal: AbortSignal.timeout(5000) });
  expect(JSON.parse(result.text)).toEqual({ candidate: "A", reason: "I can answer", message: "  Exact reply\n" });
});

import { describe, expect, it, vi } from "vitest";
import { memberProposalHistory, parseElectionProposal, holdElection, parseElectionChoice } from "./room-election.ts";
import type { RoomElectionRound } from "../shared/room-election.ts";

const members = ["A", "B", "C"].map(id => ({ id, name: id }));
const round = (): RoomElectionRound => ({ round: 1, revision: "history-v1", members, order: members.map(m => m.id), proposals: [], votes: [], judge: { selection: { instanceId: "judge-engine", model: "judge-model" }, tiedCandidates: [] } });
const defaults = () => ({ round: round(), context: "Earlier: B found the failure. User: investigate it.", bulletin: "", signal: new AbortController().signal, current: () => {}, changed: () => {}, judge: vi.fn(async (_prompt: string, _signal: AbortSignal, _allowed: string[]) => JSON.stringify({ candidate: "B", reason: "B has the evidence." })) });
const json = (candidate: string, reason?: string) => JSON.stringify({ candidate, reason });

describe("parallel room elections", () => {
  it("collects parallel ready-made proposals before calling one judge with history and drafts", async () => {
    const args = defaults();
    const gates: Array<() => void> = [];
    const calls: string[] = [];
    const run = holdElection({ ...args, infer: async (bot, prompt, _, ballot) => {
      calls.push(`${ballot!.phase}:${bot.id}`);
      expect(prompt).toContain("Earlier: B found the failure");
      expect(ballot!.allowed).toEqual([bot.id, "task_complete"]);
      await new Promise<void>(resolve => gates.push(resolve));
      return JSON.stringify({ candidate: bot.id, reason: `${bot.id} has evidence`, message: `Draft from ${bot.id}` });
    } });
    expect(calls).toEqual(["proposing:A", "proposing:B", "proposing:C"]);
    gates[1](); gates[2]();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(args.judge).not.toHaveBeenCalled();
    gates[0]();
    expect(await run).toBe("B");
    expect(calls).toHaveLength(3);
    expect(args.round.votes).toEqual([]);
    expect(args.judge).toHaveBeenCalledOnce();
    const [prompt, , allowed] = args.judge.mock.calls[0];
    expect(prompt).toContain(args.context);
    expect(allowed).toEqual(["A", "B", "C", "task_complete"]);
    for (const proposal of args.round.proposals) expect(prompt).toContain(JSON.stringify(proposal));

  });

  it.each(["B", "task_complete"])("always lets the judge choose %s, including without a tie", async winner => {
    const args = defaults(); args.judge.mockResolvedValue(json(winner, "Needed next"));
    expect(await holdElection({ ...args, infer: async bot => JSON.stringify({ candidate: bot.id, reason: "Useful", message: "Ready" }) })).toBe(winner);
    expect(args.judge).toHaveBeenCalledOnce();
  });

  it.each([json("missing", "Invalid"), json("B")])("rejects invalid judge decisions without inventing a winner", async invalid => {
    const args = defaults(); args.judge.mockResolvedValue(invalid);
    await expect(holdElection({ ...args, infer: async bot => JSON.stringify({ candidate: bot.id, reason: "Useful", message: "Ready" }) })).rejects.toThrow();
    expect(args.round.winner).toBeUndefined();
    expect(args.judge).toHaveBeenCalledTimes(2);
  });

  it("cannot select a member who proposed completion instead of a message", async () => {
    const args = defaults();
    await expect(holdElection({ ...args, infer: async () => JSON.stringify({ candidate: "task_complete", reason: "Done", message: "" }) })).rejects.toThrow();
    expect(args.judge.mock.calls[0][2]).toEqual(["task_complete"]);
  });

  it("cancels and drains concurrent calls after a failure before returning", async () => {
    const args = defaults();
    let cleaned = 0;
    await expect(holdElection({ ...args, infer: async (bot, _, signal) => {
      if (bot.id === "A") throw new Error("Provider unavailable");
      await new Promise<void>(resolve => signal.addEventListener("abort", () => setTimeout(resolve, 10), { once: true }));
      cleaned++;
      signal.throwIfAborted();
      return "";
    } })).rejects.toThrow("Provider unavailable");
    expect(cleaned).toBe(2);
    expect(args.round.votes).toEqual([]);
  });

  it("does not accept results after Stop or a changed conversation", async () => {
    const args = defaults(); const controller = new AbortController();
    await expect(holdElection({ ...args, signal: controller.signal, infer: async () => { controller.abort(); return json("A", "Too late"); } })).rejects.toThrow();
    expect(args.round.proposals).toEqual([]);
    const changed = defaults();
    await expect(holdElection({ ...changed, current: () => { throw new Error("Election context changed"); }, infer: async () => json("A", "Too late") })).rejects.toThrow("context changed");
  });

  it("requires reasons for proposals and judges and validates complete draft messages", () => {
    for (const data of [{ candidate: "A" }, { candidate: "A", reason: " " }, { candidate: "X", reason: "why" }, { candidate: "A", reason: "x".repeat(501) }]) expect(() => parseElectionChoice(JSON.stringify(data), ["A"], "B")).toThrow();
    for (const raw of [{ candidate: "A", reason: "why" }, { candidate: "A", reason: "why", message: " " }, { candidate: "B", reason: "why", message: "Draft" }, { candidate: "A", reason: "why", message: "x".repeat(8001) }, { candidate: "task_complete", reason: "Done", message: "Unexpected" }]) {
      expect(() => parseElectionProposal(JSON.stringify(raw), ["A", "B", "task_complete"], "A")).toThrow();
    }
    expect(parseElectionProposal(JSON.stringify({ candidate: "A", reason: "why", message: "  Exact reply\n" }), ["A"], "A").message).toBe("  Exact reply\n");
  });
});


it("feeds back only the member's own thinking and distinguishes selected from actually posted", () => {
  const first = round();
  first.proposals = [
    { botId: "A", candidate: "A", reason: "A private reason", message: "A draft" },
    { botId: "B", candidate: "B", reason: "B private reason", message: "B draft" },
  ];
  first.winner = "A";
  expect(memberProposalHistory([first], "A")).toBe('I was thinking: "A private reason"\nI wanted to say: "A draft"');
  first.postedMessageId = "posted";
  expect(memberProposalHistory([first], "A")).toBe('I was thinking: "A private reason"\nI said: "A draft"');
  expect(memberProposalHistory([first], "B")).toBe('I was thinking: "B private reason"\nI wanted to say: "B draft"');
});

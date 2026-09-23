import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { CodexDriver } from "./drivers/codex.ts";
import { holdElection } from "./room-election.ts";
import type { RoomElectionRound } from "../shared/room-election.ts";
import { inferRoomElection } from "./room-election-inference.ts";
import { createOpenCodeDriver } from "./drivers/acp/opencode-go.ts";
import { RoomBotHistories, roomBotHistoryFile } from "./room-bot-history.ts";

it("submits a private ballot through the real Codex adapter and injected MCP proxy", async () => {
  const home = mkdtempSync(join(tmpdir(), "omb-election-codex-"));
  const cli = fileURLToPath(new URL("./testing/fake-codex-app-server.ts", import.meta.url));
  chmodSync(cli, 0o755);
  const dump = join(home, "calls.json");
  const instance = await CodexDriver.create({ instanceId: "election-codex-fixture", displayName: "Fixture", enabled: true,
    environment: { HOME: home, USERPROFILE: home, CODEX_HOME: join(home, ".codex"), FAKE_CODEX_MODE: "resume", FAKE_CODEX_DUMP: dump }, config: { cli, fullAuto: false } });
  try {
    const root = join(home, "room-history");
    const result = await inferRoomElection({ adapter: instance.adapter, botId: "A", prompt: "Read the supplied conversation and choose the next speaker. Rejected draft: secret alternative.",
      phase: "judging", candidates: ["B", "task_complete"], selection: { model: "gpt-5.4", effort: "medium" }, signal: AbortSignal.timeout(10_000),
      history: { store: new RoomBotHistories(root), roomThreadId: "room", selectionKey: "codex-model" } });
    expect(JSON.parse(result.text)).toMatchObject({ candidate: "B", reason: expect.any(String) });
    const cursor = JSON.parse(readFileSync(roomBotHistoryFile(root, "room", "A"), "utf8")).cursor;
    await inferRoomElection({ adapter: instance.adapter, botId: "A", prompt: "A new user message arrived. Propose again.",
      phase: "judging", candidates: ["B", "task_complete"], selection: { model: "gpt-5.4", effort: "medium" }, signal: AbortSignal.timeout(10_000),
      history: { store: new RoomBotHistories(root), roomThreadId: "room", selectionKey: "codex-model" } });
    const calls = JSON.parse(readFileSync(dump, "utf8")).calls as Array<{ method: string; params: { threadId?: string; cwd?: string } }>;
    expect(calls.find(call => call.method === "thread/resume")?.params).toMatchObject({ threadId: cursor, cwd: expect.any(String) });
    expect(calls.some(call => call.method === "thread/start")).toBe(false);
  } finally { await instance.dispose(); rmSync(home, { recursive: true, force: true }); }
}, 20_000);

it("submits through OpenCode's ACP driver using its chosen catalog model", async () => {
  const home = mkdtempSync(join(tmpdir(), "omb-election-opencode-"));
  const cli = fileURLToPath(new URL("./testing/fake-acp-cli.ts", import.meta.url));
  chmodSync(cli, 0o755);
  const model = "opencode/fixture-model";
  const driver = createOpenCodeDriver(async () => ({ default: model, options: [{ id: model, label: "Fixture" }] }));
  const instance = await driver.create({ instanceId: "election-opencode-fixture", displayName: "Fixture", enabled: true,
    environment: { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home, XDG_DATA_HOME: home, OPENCODE_API_KEY: "fixture-key", FAKE_ACP_MODELS: model },
    config: { cli, fullAuto: false, workspace: home } });
  try {
    const root = join(home, "room-history");
    const result = await inferRoomElection({ adapter: instance.adapter, botId: "A", prompt: "Read the supplied conversation and propose the next speaker.",
      phase: "judging", candidates: ["B", "task_complete"], selection: { model }, signal: AbortSignal.timeout(10_000),
      history: { store: new RoomBotHistories(root), roomThreadId: "room", selectionKey: "opencode-model" } });
    expect(JSON.parse(result.text)).toMatchObject({ candidate: "B", reason: expect.any(String) });
    const cursor = JSON.parse(readFileSync(roomBotHistoryFile(root, "room", "A"), "utf8")).cursor;
    const vote = await inferRoomElection({ adapter: instance.adapter, botId: "A", prompt: "All proposals are in. Vote.",
      phase: "judging", candidates: ["B", "task_complete"], selection: { model }, signal: AbortSignal.timeout(10_000),
      history: { store: new RoomBotHistories(root), roomThreadId: "room", selectionKey: "opencode-model" } });
    expect(JSON.parse(vote.text)).toMatchObject({ candidate: "B", reason: expect.any(String) });
    expect(JSON.parse(readFileSync(roomBotHistoryFile(root, "room", "A"), "utf8")).cursor).toBe(cursor);
  } finally { await instance.dispose(); rmSync(home, { recursive: true, force: true }); }
}, 20_000);


it("runs overlapping proposals followed by one judge on a Codex instance", async () => {
  const home = mkdtempSync(join(tmpdir(), "omb-election-codex-parallel-"));
  const cli = fileURLToPath(new URL("./testing/fake-codex-app-server.ts", import.meta.url));
  const log = join(home, "timings.jsonl");
  const control = join(home, "control.json");
  writeFileSync(control, JSON.stringify({ delayMs: 800 }));
  const instance = await CodexDriver.create({ instanceId: "election-codex-parallel-fixture", displayName: "Fixture", enabled: true,
    environment: { HOME: home, USERPROFILE: home, CODEX_HOME: join(home, ".codex"), FAKE_CLAUDE_ELECTION_LOG: log, FAKE_CLAUDE_ELECTION_CONTROL: control }, config: { cli, fullAuto: false } });
  try {
    const members = ["A", "B", "C"].map(id => ({ id, name: id }));
    const round: RoomElectionRound = { round: 1, revision: "parallel-fixture", members, order: members.map(m => m.id), proposals: [], votes: [], judge: { selection: { instanceId: "fixture", model: "gpt-5.4" }, tiedCandidates: [] } };
    const winner = await holdElection({ round, context: "User: answer the question.", bulletin: "", signal: AbortSignal.timeout(15_000), current: () => {}, changed: () => {},
      judge: async (prompt, signal, candidates) => (await inferRoomElection({ adapter: instance.adapter, botId: "judge", prompt, signal, candidates, phase: "judging", selection: { model: "gpt-5.4" } })).text,
      infer: async (bot, prompt, signal, ballot) => (await inferRoomElection({ adapter: instance.adapter, botId: bot.id, prompt, signal,
        phase: ballot!.phase, candidates: ballot!.allowed, selection: { model: "gpt-5.4", effort: "medium" } })).text });
    expect(winner).toBe("A");
    const calls = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line) as { phase: string; startedAt: number; submittedAt: number; pid: number });
    expect(calls).toHaveLength(4);
    for (const phase of ["proposing"]) {
      const batch = calls.filter(call => call.phase === phase);
      expect(batch).toHaveLength(3);
      expect(new Set(batch.map(call => call.pid)).size).toBe(3);
      const overlapMs = Math.min(...batch.map(call => call.submittedAt)) - Math.max(...batch.map(call => call.startedAt));
      expect(overlapMs).toBeGreaterThan(0);
      console.info("Codex native overlap", JSON.stringify({ phase, overlapMs }));
    }
    expect(Math.min(...calls.filter(c => c.phase === "judging").map(c => c.startedAt)))
      .toBeGreaterThanOrEqual(Math.max(...calls.filter(c => c.phase === "proposing").map(c => c.submittedAt)));
  } finally { await instance.dispose(); rmSync(home, { recursive: true, force: true }); }
}, 20_000);

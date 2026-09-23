import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";
import type { WireMessage as Message } from "../shared/wire.ts";
import { roomBotHistoryDirectory } from "./room-bot-history.ts";

let fixture: Awaited<ReturnType<typeof launchVerificationServer>>;
let directory: string;
let controlFile: string;
let log: string;
const evidence: unknown[] = [];
const api = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(fixture.info.url + path, { method, headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json() as any;
  evidence.push({ method, path, status: response.status, value });
  expect(response.ok, JSON.stringify(value)).toBe(true);
  return value;
};
const calls = (): Array<{ startedAt: number; submittedAt: number; pid: number; prompt: string; argv: string[]; phase: string; tools: Array<{ name: string }> }> => existsSync(log)
  ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const config = (value: object) => writeFileSync(controlFile, JSON.stringify(value));
const messages = async (room: { threadId: string }): Promise<Message[]> => (await api("GET", `/api/threads/${room.threadId}/messages`)).messages;
const settled = async (room: { id: string; threadId: string }) => {
  await expect.poll(async () => (await api("GET", "/api/bots?messages=0")).groups.find((g: { id: string }) => g.id === room.id)?.working,
    { timeout: 20_000, interval: 100 }).toBe(false);
  return messages(room);
};
const createRoom = async () => {
  const ids: string[] = [];
  for (const name of ["A", "B", "C"]) {
    const { bot } = await runControlOmb(["new-bot", "--name", name, "--url", fixture.info.url]) as { bot: { id: string } };
    ids.push(bot.id);
  }
  const room = (await api("POST", "/api/groups", { name: "Election fixture", memberIds: ids })).group;
  await api("PATCH", `/api/groups/${room.id}/setup`, { action: "skip" });
  return room as { id: string; threadId: string };
};

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "omb-election-fixture-"));
  controlFile = join(directory, "control.json");
  log = join(directory, "inference.jsonl");
  config({});
  fixture = await launchVerificationServer({ ...process.env, FAKE_CLAUDE_REPLIES: JSON.stringify(["Elected reply fixture: the requested answer is ready."]),
    FAKE_CLAUDE_TOOL_CALLS: "[]", FAKE_CLAUDE_ELECTION_LOG: log, FAKE_CLAUDE_ELECTION_CONTROL: controlFile });
  evidence.push({ fixture: fixture.info });
}, 60_000);

afterAll(async () => {
  if (fixture) {
    const evidencePath = fixture.info.logPath + ".room-election.json";
    writeFileSync(evidencePath, JSON.stringify({ evidence, calls: calls() }, null, 2));
    await fixture.close();
    console.info(JSON.stringify({ ...fixture.info, evidencePath, fixtureRemoved: !existsSync(fixture.info.dataDir) }));
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
}, 30_000);

it("retains all drafts for the judge and only personal proposals plus posted messages for each member", async () => {
  config({ uniqueDrafts: true });
  const room = await createRoom();
  const before = calls().length;
  await api("POST", `/api/groups/${room.id}/messages`, { text: "first-history-message: answer this request" });
  const transcript = await settled(room);
  const receipt = transcript.find(message => message.goalRun)!.goalRun!;
  expect(receipt.status, receipt.detail).toBe("completed");
  const round = receipt.election!.rounds[0];
  const rejected = round.proposals.filter(p => p.botId !== round.winner);
  const inference = calls().slice(before);
  const laterMembers = inference.slice(4).filter(call => call.phase === "proposing");
  for (const call of laterMembers) {
    const own = round.proposals.find(p => call.prompt.includes(`(${p.botId})`))!;
    expect(call.prompt).toContain(`I was thinking: ${JSON.stringify(own.reason)}`);
    expect(call.prompt).toContain(`${own.botId === round.winner ? "I said" : "I wanted to say"}: ${JSON.stringify(own.message)}`);
    for (const proposal of round.proposals.filter(p => p.botId !== own.botId)) {
      expect(call.prompt).not.toContain(proposal.reason);
      if (proposal.botId !== round.winner) expect(call.prompt).not.toContain(proposal.message);
    }
    expect(call.argv).toContain("--resume");
  }
  const directory = roomBotHistoryDirectory(join(fixture.info.dataDir, "room-bot-histories"), room.threadId);
  const saved = () => readdirSync(directory).map(file => JSON.parse(readFileSync(join(directory, file), "utf8")));
  const first = saved();
  expect(first).toHaveLength(4);
  const judgeHistory = first.find(h => h.botId === `room-judge-${room.id}`)!;
  for (const proposal of rejected) expect(JSON.stringify(judgeHistory.entries)).toContain(proposal.message);
  for (const own of round.proposals) {
    const memberHistory = first.find(h => h.botId === `room-proposer-${own.botId}`)!;
    expect(JSON.stringify(memberHistory.entries)).toContain(own.message);
    for (const peer of round.proposals.filter(p => p.botId !== own.botId)) {
      expect(JSON.stringify(memberHistory.entries)).not.toContain(peer.reason);
      if (peer.botId !== round.winner) expect(JSON.stringify(memberHistory.entries)).not.toContain(peer.message);
    }
  }
  const judgeCalls = inference.filter(call => call.phase === "judging");
  expect(judgeCalls[1].argv[judgeCalls[1].argv.indexOf("--resume") + 1]).toBe(judgeHistory.cursor);
  config({ uniqueDrafts: true, requestMarker: "second-history-message" });
  await api("POST", `/api/groups/${room.id}/messages`, { text: "second-history-message: answer the follow-up" });
  expect((await settled(room)).filter(message => message.kind === "text" && message.role === "bot")).toHaveLength(2);
  const second = saved();
  for (const initial of first) {
    const continued = second.find(h => h.botId === initial.botId)!;
    expect(continued.cursor).toBe(initial.cursor);
    expect(continued.entries.slice(0, initial.entries.length)).toEqual(initial.entries);
  }
  evidence.push({ judgeHistory: { first, second } });
  await api("DELETE", `/api/groups/${room.id}`);
  expect(existsSync(directory)).toBe(false);
}, 30_000);

it.each(["chat", "goal"])("runs proposals → judge → auto-posted reply → completion for legacy %s sends", async mode => {
  config({});
  const room = await createRoom();
  const before = calls().length;
  await api("POST", `/api/groups/${room.id}/messages`, { text: "Investigate the earlier finding and give the answer.", mode });
  const transcript = await settled(room);
  const receipt = transcript.find(message => message.goalRun)?.goalRun;
  expect(receipt).toMatchObject({ status: "completed", turnCount: 1 });
  expect(receipt?.election?.rounds).toHaveLength(2);
  const [first, last] = receipt!.election!.rounds;
  expect(first.proposals).toHaveLength(3);
  expect(first.votes).toHaveLength(0);
  expect(last.winner).toBe("task_complete");
  expect(first.constrainedChoices).toBeUndefined();
  expect(first.votes.every(vote => vote.reason === undefined)).toBe(true);
  const inference = calls().slice(before);
  expect(inference).toHaveLength(8);
  expect(inference.map(call => call.phase)).toEqual(["proposing", "proposing", "proposing", "judging", "proposing", "proposing", "proposing", "judging"]);
  for (const proposal of first.proposals) expect(inference[3].prompt).toContain(JSON.stringify(proposal));
  for (const call of inference) {
    expect(call.tools.map(tool => tool.name)).toEqual([call.phase === "proposing" ? "submit_proposal" : "select_response"]);
    expect(call.argv).toContain("--strict-mcp-config");
    expect(call.argv[call.argv.indexOf("--model") + 1]).toBe("claude-sonnet-5");
  }
  const replies = transcript.filter(message => message.kind === "text" && message.role === "bot");
  expect(replies).toHaveLength(1);
  expect(replies[0].from?.botId).toBe(first.winner);
  expect(replies[0].text).toBe(first.proposals.find(p => p.botId === first.winner)!.message);
  expect(inference[4].prompt).toContain("Elected reply fixture");
  expect(replies.some(message => message.text?.includes('"candidate"'))).toBe(false);
}, 30_000);

it("pauses before judging when a proposal is invalid, then resumes in the original conversation", async () => {
  config({ invalid: true });
  const room = await createRoom();
  const before = calls().length;
  await api("POST", `/api/groups/${room.id}/messages`, { text: "Give the answer." });
  const transcript = await settled(room);
  const card = transcript.find(message => message.goalRun)!;
  expect(card.goalRun?.status).toBe("paused");
  expect(card.goalRun?.election?.rounds[0].votes).toEqual([]);
  expect(calls().slice(before).every(call => call.phase === "proposing")).toBe(true);
  config({});
  await api("POST", `/api/groups/${room.id}/elections/${card.id}/resume`, { threadId: room.threadId });
  expect((await settled(room)).filter(message => message.goalRun).at(-1)?.goalRun?.status).toBe("completed");
  await api("POST", `/api/groups/${room.id}/elections/${card.id}/resume`, { threadId: room.threadId });
  expect((await messages(room)).filter(message => message.goalRun)).toHaveLength(2);
}, 30_000);

it("invalidates both phases when new human input arrives and includes it before judging", async () => {
  config({ delayMs: 100 });
  const room = await createRoom();
  await api("POST", `/api/groups/${room.id}/messages`, { text: "Start investigating." });
  await expect.poll(async () => (await messages(room)).find(m => m.goalRun)?.goalRun?.election?.rounds[0].proposals.length,
    { timeout: 10_000, interval: 50 }).toBeGreaterThan(0);
  await api("POST", `/api/groups/${room.id}/messages`, { text: "Correction: include the revised requirements.", sendId: "election-revision-fixture" });
  const transcript = await settled(room);
  const rounds = transcript.flatMap(m => m.goalRun?.election?.rounds ?? []);
  expect(rounds[0].superseded).toBe(true);
  expect(rounds[0].votes).toHaveLength(0);
  expect(transcript.filter(m => m.sendId === "election-revision-fixture")).toHaveLength(1);
  const completedRound = rounds.find(round => !round.superseded)!;
  const firstVote = calls().find(call => call.phase === "judging" && call.prompt.includes(completedRound.revision));
  expect(firstVote?.prompt).toContain("Correction: include the revised requirements.");
  config({});
}, 30_000);

it("Stop aborts inference, leaves no reply and cannot be revived by late results", async () => {
  config({ delayMs: 1500 });
  const room = await createRoom();
  await api("POST", `/api/groups/${room.id}/messages`, { text: "Stop this before anyone replies." });
  await api("POST", `/api/groups/${room.id}/interrupt`, { threadId: room.threadId });
  const transcript = await settled(room);
  expect(transcript.find(m => m.goalRun)?.goalRun?.status).toBe("stopped");
  expect(transcript.filter(m => m.role === "bot" && m.kind === "text")).toEqual([]);
  config({});
}, 30_000);

it("starts an election for a bot post without manufacturing a human message", async () => {
  const room = await createRoom();
  const state = await api("GET", "/api/bots?messages=0");
  const poster = state.groups.find((g: { id: string }) => g.id === room.id).memberIds[0];
  const planFile = join(directory, "post.json");
  writeFileSync(planFile, JSON.stringify({ [poster]: { turns: [
    { steps: [{ tool: "post_to_room", arguments: { group_id: room.id, message: "Please consider this new finding." } }], reply: "Posted the finding." },
    { reply: "Elected reply fixture: the posted finding has been addressed." },
  ] } }));
  config({ planFile });
  await api("POST", `/api/bots/${poster}/messages`, { text: "Post the finding in the room." });
  await expect.poll(async () => (await messages(room)).some(m => m.goalRun), { timeout: 10_000 }).toBe(true);
  const transcript = await settled(room);
  const card = transcript.find(m => m.goalRun)!;
  expect(card.goalRun!.status, JSON.stringify(card.goalRun)).toBe("completed");
  const source = transcript.find(m => m.id === card.goalRun!.election!.sourceMessageId)!;
  expect(source.role).toBe("bot");
  expect(source.peerPost).toBeDefined();
  expect(transcript.some(m => m.role === "user")).toBe(false);
  config({});
}, 30_000);

it("lets different elected members give the same requested greeting without pausing", async () => {
  config({ requiredReplies: 3 });
  const room = await createRoom();
  await api("POST", `/api/groups/${room.id}/messages`, { text: "Each member should give the same greeting." });
  const transcript = await settled(room);
  const receipt = transcript.find(m => m.goalRun)!.goalRun!;
  expect(receipt.status, receipt.detail).toBe("completed");
  const replies = transcript.filter(m => m.role === "bot" && m.kind === "text");
  expect(replies).toHaveLength(3);
  expect(new Set(replies.map(m => m.from!.botId)).size).toBe(3);
  expect(new Set(replies.map(m => m.text)).size).toBe(1);
  config({});
}, 30_000);

it("starts a fresh election for a second message after completion", async () => {
  const room = await createRoom();
  for (const text of ["First fixture request", "Second fixture request"]) {
    config({ requestMarker: text });
    await api("POST", `/api/groups/${room.id}/messages`, { text });
    const transcript = await settled(room);
    const receipt = transcript.filter(m => m.goalRun).at(-1)!.goalRun!;
    expect(receipt.status, receipt.detail).toBe("completed");
    expect(receipt.election!.rounds[0].proposals).toHaveLength(3);
    expect(receipt.election!.rounds[0].votes).toHaveLength(0);
  }
  const transcript = await messages(room);
  expect(transcript.filter(m => m.goalRun)).toHaveLength(2);
  expect(transcript.filter(m => m.role === "bot" && m.kind === "text")).toHaveLength(2);
  config({});
}, 30_000);

it("shows a fresh discussion card for a follow-up during an active election and allows another requested identical reply", async () => {
  config({ delayMs: 150 });
  const room = await createRoom();
  await api("POST", `/api/groups/${room.id}/messages`, { text: "First active request" });
  await expect.poll(async () => (await messages(room)).some(m => m.role === "bot" && m.kind === "text"), { timeout: 15_000, interval: 30 }).toBe(true);
  config({ delayMs: 150, requestMarker: "Second active request" });
  const response = await api("POST", `/api/groups/${room.id}/messages`, { text: "Second active request", sendId: "second-active-election-fixture" });
  expect(response.queued).toBe(true);
  const transcript = await settled(room);
  const cards = transcript.filter(m => m.goalRun);
  expect(cards).toHaveLength(2);
  expect(cards[0].goalRun!.election!.resumedBy).toBe(cards[1].id);
  expect(cards[1].goalRun!.status, cards[1].goalRun!.detail).toBe("completed");
  expect(cards[1].goalRun!.goal).toBe("Second active request");
  expect(transcript.indexOf(cards[1])).toBeGreaterThan(transcript.findIndex(m => m.sendId === "second-active-election-fixture"));
  expect(cards[1].goalRun!.election!.rounds[0].votes).toHaveLength(0);
  expect(transcript.filter(m => m.role === "bot" && m.kind === "text")).toHaveLength(2);
  config({});
}, 30_000);

it("still pauses the same speaker repeating itself without new input, then accepts a new message", async () => {
  config({ requiredReplies: 3, sameSpeaker: true });
  const room = await createRoom();
  await api("POST", `/api/groups/${room.id}/messages`, { text: "A request that produces a repeated answer" });
  const first = await settled(room);
  expect(first.find(m => m.goalRun)!.goalRun!.status).toBe("paused");
  expect(first.find(m => m.goalRun)!.goalRun!.detail).toContain("without new input");
  config({ requestMarker: "New request after pause" });
  await api("POST", `/api/groups/${room.id}/messages`, { text: "New request after pause" });
  const next = await settled(room);
  expect(next.filter(m => m.goalRun).at(-1)!.goalRun!.status).toBe("completed");
  config({});
}, 30_000);

it("persists the selected judge model and keeps proposal details out of member context", async () => {
  config({ tie: true });
  const room = await createRoom();
  const group = (await api("GET", "/api/bots?messages=0")).groups.find((g: any) => g.id === room.id);
  const instance = (await api("GET", "/api/instances")).instances.find((i: any) => i.capabilities?.agentsMcp);
  const model = instance.models.options.find((m: any) => m.id !== "claude-sonnet-5")?.id ?? instance.models.default;
  const selection = { instanceId: instance.instanceId, model };
  const saved = await api("PATCH", `/api/groups/${room.id}/members`, { memberIds: group.memberIds, expectedMemberIds: group.memberIds, judgeModelSelection: selection, expectedJudgeModelSelection: null });
  expect(saved.group.judgeModelSelection).toEqual(selection);
  const stale = await fetch(fixture.info.url + `/api/groups/${room.id}/members`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberIds: group.memberIds, expectedMemberIds: group.memberIds, judgeModelSelection: null, expectedJudgeModelSelection: null }) });
  expect(stale.status).toBe(409);
  const before = calls().length;
  await api("POST", `/api/groups/${room.id}/messages`, { text: "Let the judge break a tied vote." });
  const transcript = await settled(room);
  const receipt = transcript.find(m => m.goalRun)?.goalRun;
  expect(receipt?.status).toBe("completed");
  const first = receipt!.election!.rounds[0];
  expect(first.judge).toMatchObject({ selection, candidate: first.winner, reason: expect.stringContaining("judge selected") });
  expect(first.judge!.candidates).toHaveLength(4);
  expect(first.votes.every(vote => vote.reason === undefined)).toBe(true);
  const inference = calls().slice(before);
  const judge = inference.filter(call => call.phase === "judging");
  expect(judge).toHaveLength(2);
  expect(judge[0].tools.map(tool => tool.name)).toEqual(["select_response"]);
  expect(judge[0].argv[judge[0].argv.indexOf("--model") + 1]).toBe(model);
  await expect.poll(async () => {
    const usage = await api("GET", "/api/usage?groupBy=bot");
    return usage.groups.find((row: any) => row.key === `bot:room-judge-${room.id}`);
  }, { timeout: 5000 }).toMatchObject({ input: 200, cachedInput: 160, cacheReportedInput: 200, cacheReportedTurns: 2 });
  const usage = await api("GET", "/api/usage?groupBy=bot");
  for (const id of group.memberIds) {
    const member = usage.groups.find((row: any) => row.key === `bot:${id}`);
    // Two proposal rounds, with no follow-up generation.
    expect(member.cachedInput).toBe(160);
    expect(member.cacheReportedTurns).toBe(2);
  }
  const secondRound = inference.findLast(call => call.phase === "proposing")!;
  expect(secondRound.prompt).not.toContain("Room election history");
  expect(secondRound.prompt).not.toContain(first.judge!.reason);
  expect(secondRound.prompt).toContain("Your own proposal history");
  for (const vote of first.votes) expect(secondRound.prompt).toContain(JSON.stringify(vote));
  // A separate human request still sees the persisted election history.
  const secondBefore = calls().length;
  config({ requestMarker: "A fresh request after the judged round" });
  await api("POST", `/api/groups/${room.id}/messages`, { text: "A fresh request after the judged round" });
  const followup = await settled(room);
  expect(followup.filter(m => m.goalRun).at(-1)?.goalRun?.status).toBe("completed");
  expect(calls()[secondBefore].prompt).not.toContain(first.judge!.reason);
  const invalid = await fetch(fixture.info.url + `/api/groups/${room.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ judgeModelSelection: { instanceId: "missing", model: "missing" } }) });
  expect(invalid.status).toBe(400);
}, 30_000);


it("stops a pending judge without posting its late winner", async () => {
  config({ tie: true, judgeDelayMs: 2000 });
  const room = await createRoom();
  await api("POST", `/api/groups/${room.id}/messages`, { text: "Stop this tied round." });
  await expect.poll(async () => (await messages(room)).find(m => m.goalRun)?.goalRun?.election?.phase,
    { timeout: 15_000, interval: 30 }).toBe("judging");
  await api("POST", `/api/groups/${room.id}/interrupt`, {});
  const transcript = await settled(room);
  const receipt = transcript.find(m => m.goalRun)!.goalRun!;
  expect(receipt.status).toBe("stopped");
  expect(receipt.election!.rounds[0].winner).toBeUndefined();
  expect(receipt.election!.rounds[0].judge!.reason).toBeUndefined();
  expect(transcript.filter(m => m.kind === "text" && m.role === "bot")).toHaveLength(0);
  expect((await api("GET", "/api/bots?messages=0")).bots.every((b: any) => !b.busy)).toBe(true);
}, 30_000);


it("overlaps native proposals and waits for all of them before each single judge", async () => {
  config({ delayMs: 800 });
  const room = await createRoom();
  const before = calls().length;
  await api("POST", `/api/groups/${room.id}/messages`, { text: "Measure the proposal barrier." });
  expect((await settled(room)).find(m => m.goalRun)?.goalRun?.status).toBe("completed");
  const inference = calls().slice(before);
  expect(inference).toHaveLength(8);
  for (let offset = 0; offset < inference.length; offset += 4) {
    const proposals = inference.slice(offset, offset + 3);
    const judge = inference[offset + 3];
    expect(proposals.every(call => call.phase === "proposing")).toBe(true);
    expect(judge.phase).toBe("judging");
    expect(new Set(proposals.map(call => call.pid)).size).toBe(3);
    expect(Math.min(...proposals.map(call => call.submittedAt)) - Math.max(...proposals.map(call => call.startedAt))).toBeGreaterThan(0);
    expect(judge.startedAt).toBeGreaterThanOrEqual(Math.max(...proposals.map(call => call.submittedAt)));
  }
}, 30_000);

it("keeps a room discussion public instead of delegating members into their direct threads", async () => {
  const room = await createRoom();
  const state = await api("GET", "/api/bots?messages=0");
  const ids: string[] = state.groups.find((g: any) => g.id === room.id).memberIds;
  const { bot: outsider } = await runControlOmb(["new-bot", "--name", "Uncalled specialist", "--url", fixture.info.url]) as { bot: { id: string } };
  await api("PATCH", `/api/bots/${ids[0]}`, { peers: [...ids.slice(1), outsider.id] });
  const fresh = await api("GET", "/api/bots?messages=0");
  const directThreads = [...ids, outsider.id].map(id => fresh.bots.find((b: any) => b.id === id).threadId);
  const before = await Promise.all(directThreads.map(threadId => messages({ threadId })));
  const planFile = join(directory, "public-discussion.json");
  writeFileSync(planFile, JSON.stringify({
    [ids[0]]: {
      expectSystemIncludes: ["Members of this room discuss the task through their own elected public replies here."],
      steps: [
        { tool: "coordinate_bots", arguments: { bot_ids: [ids[1]], message: "Give me your views privately.", request_key: "hidden-id" }, expectError: true },
        { tool: "coordinate_bots", arguments: { bot_ids: ["B"], message: "Give me your views privately.", request_key: "hidden-name" }, expectError: true },
        { tool: "coordinate_bots", arguments: { bot_ids: [outsider.id, ids[2]], message: "Discuss this privately.", request_key: "hidden-mixed" }, expectError: true },
      ], reply: "Elected reply fixture: A's public contribution.",
    },
    [ids[1]]: { reply: "Elected reply fixture: B's public contribution." },
    [ids[2]]: { reply: "Elected reply fixture: C's public contribution." },
  }));
  config({ planFile, requiredReplies: 3 });
  await api("POST", `/api/groups/${room.id}/messages`, { text: "All three of you discuss the topic in this group." });
  const transcript = await settled(room);
  expect(transcript.find(m => m.goalRun)?.goalRun?.status).toBe("completed");
  expect(transcript.filter(m => m.kind === "text" && m.role === "bot").map(m => m.from?.botId)).toEqual(ids);
  expect(transcript.filter(m => m.roomRequest || m.threadRef)).toEqual([]);
  const after = await Promise.all(directThreads.map(threadId => messages({ threadId })));
  expect(after).toEqual(before);
  // Automatic posting must never start the old working/delegation plan.
  expect(existsSync(planFile + ".evidence.jsonl")).toBe(false);
  config({});
}, 30_000);

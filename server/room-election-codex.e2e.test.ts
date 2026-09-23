import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { launchVerificationServer } from "../scripts/control-omb.ts";
import type { WireMessage } from "../shared/wire.ts";
import { roomBotHistoryDirectory } from "./room-bot-history.ts";

it("auto-posts Codex drafts and resumes isolated member and judge histories across follow-up requests", async () => {
  const fixture = await launchVerificationServer({ ...process.env, FAKE_CLAUDE_TOOL_CALLS: "[]" },
    undefined, undefined, undefined, undefined, undefined, ["codex"]);
  const evidence: unknown[] = [{ fixture: fixture.info }];
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(fixture.info.url + path, { method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    const value = await response.json() as any;
    evidence.push({ method, path, status: response.status, value });
    expect(response.ok, JSON.stringify(value)).toBe(true);
    return value;
  };
  try {
    const plan = join(fixture.info.dataDir, "codex-room-plan.json");
    const control = join(fixture.info.dataDir, "election-control.json");
    const wrapper = join(fixture.info.dataDir, "codex-room.mjs");
    writeFileSync(control, JSON.stringify({ requiredReplies: 2 }));
    writeFileSync(wrapper, [
      "#!/usr/bin/env node",
      `Object.assign(process.env, ${JSON.stringify({ FAKE_CODEX_MODE: "resume", FAKE_CODEX_ROOM_PLAN: plan,
        FAKE_CODEX_SESSION_DIR: join(fixture.info.dataDir, "fake-native-sessions"), FAKE_CLAUDE_ELECTION_CONTROL: control })});`,
      `await import(${JSON.stringify(new URL("./testing/fake-codex-app-server.ts", import.meta.url).href)});`,
    ].join("\n"), { mode: 0o700 });
    await api("PATCH", "/api/instances/codex", { cli: wrapper });
    const model = (await api("GET", "/api/instances")).instances.find((item: any) => item.instanceId === "codex").models.default;
    const memberIds: string[] = [];
    for (const name of ["A", "B", "C"]) {
      const { bot } = await api("POST", "/api/bots", { name });
      await api("PATCH", `/api/bots/${bot.id}`, { modelSelection: { instanceId: "codex", model } });
      memberIds.push(bot.id);
    }
    writeFileSync(plan, JSON.stringify({ [memberIds[0]]: { turns: [
      { reply: "Elected reply fixture: first contribution." },
      { reply: "Elected reply fixture: second contribution." },
      { reply: "Elected reply fixture: the requested answer is ready." },
    ] } }));
    const { group } = await api("POST", "/api/groups", { name: "Codex election fixture", memberIds });
    await api("PATCH", `/api/groups/${group.id}/setup`, { action: "skip" });
    const settled = async () => {
      await expect.poll(async () => (await api("GET", "/api/bots?messages=0")).groups.find((item: any) => item.id === group.id).working,
        { timeout: 25_000, interval: 100 }).toBe(false);
      return (await api("GET", `/api/threads/${group.threadId}/messages`)).messages as WireMessage[];
    };
    await api("POST", `/api/groups/${group.id}/messages`, { text: "Give two useful contributions." });
    const first = await settled();
    const receipt = first.find(message => message.goalRun)?.goalRun;
    expect(receipt, JSON.stringify(receipt)).toMatchObject({ status: "completed", turnCount: 2 });
    expect(first.filter(message => message.kind === "text" && message.role === "bot").map(message => message.text))
      .toEqual(["Elected reply fixture: the requested answer is ready.", "Elected reply fixture: the requested answer is ready."]);

    const historiesDir = roomBotHistoryDirectory(join(fixture.info.dataDir, "room-bot-histories"), group.threadId);
    const histories = () => readdirSync(historiesDir).map(file => JSON.parse(readFileSync(join(historiesDir, file), "utf8")));
    const cursors = histories().map(history => history.cursor).sort();
    expect(new Set(cursors).size).toBe(4);
    writeFileSync(control, JSON.stringify({ requiredReplies: 1, sameSpeaker: true, requestMarker: "follow-up request" }));
    await api("POST", `/api/groups/${group.id}/messages`, { text: "follow-up request: give another contribution." });
    const second = await settled();
    expect(second.filter(message => message.goalRun).at(-1)?.goalRun).toMatchObject({ status: "completed", turnCount: 1 });
    expect(second.filter(message => message.kind === "text" && message.role === "bot").at(-1)?.text)
      .toBe("Elected reply fixture: the requested answer is ready.");
    expect(histories().map(history => history.cursor).sort()).toEqual(cursors);
    expect(existsSync(join(fixture.info.dataDir, "native", `${group.threadId}.ndjson`))).toBe(false);
    evidence.push({ first, second, cursors });
  } finally {
    const path = fixture.info.logPath + ".room-election-codex.json";
    writeFileSync(path, JSON.stringify({ evidence }, null, 2));
    await fixture.close();
    console.info(JSON.stringify({ evidencePath: path, fixtureRemoved: !existsSync(fixture.info.dataDir) }));
  }
}, 90_000);

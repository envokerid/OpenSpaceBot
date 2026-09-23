import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { resolveAgentBrowserBinary } from "../../server/browser-engine.ts";
import { waitForExit } from "../../server/testing/cleanup.ts";
import { runControlOmb } from "../control-omb.ts";
import { UI_TOOLS_DIR } from "./control-omb-ui.ts";

const enabled = process.env.OMB_UI_E2E === "1" || Boolean(resolveAgentBrowserBinary({ dataDir: UI_TOOLS_DIR, env: process.env }));
(enabled ? it : it.skip)("shows discussion cards alongside public election replies", async () => {
  const directory = mkdtempSync(join(tmpdir(), "omb-judge-ui-"));
  const control = join(directory, "control.json");
  writeFileSync(control, JSON.stringify({ delayMs: 2500, judgeDelayMs: 2500 }));
  const child = spawn(process.execPath, ["--experimental-strip-types", "scripts/control-omb.ts", "ui", "launch"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: { ...process.env, FAKE_CLAUDE_ELECTION_CONTROL: control, FAKE_CLAUDE_REPLIES: JSON.stringify(["Elected reply fixture: the requested answer is ready."]), FAKE_CLAUDE_TOOL_CALLS: "[]" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  child.stdout.on("data", chunk => { output += String(chunk); });
  child.stderr.on("data", chunk => { errors += String(chunk); });
  let info: { ui: string; url: string; botId: string; logPath: string };
  try {
    await expect.poll(() => {
      if (child.exitCode !== null) throw new Error(errors);
      try { info = JSON.parse(output); return Boolean(info.ui); } catch { return false; }
    }, { timeout: 180_000, interval: 250 }).toBe(true);
    const api = async (path: string, body?: unknown, method = "POST") => {
      const response = await fetch(info.url + path, body === undefined ? {} : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(value));
      return value;
    };
    const ui = (verb: string, ...args: string[]) => runControlOmb(["ui", verb, "--ui", info.ui, ...args]) as Promise<any>;
    const snapshot = async () => (await ui("snapshot")).snapshot as string;
    const click = async (name: string) => {
      const refs = (await ui("snapshot")).refs as Record<string, { role: string; name: string }>;
      const match = Object.entries(refs).find(([, entry]) => entry.name.includes(name));
      expect(match, JSON.stringify(refs)).toBeDefined();
      await ui("click", "--ref", "@" + match![0]);
    };
    const second = (await api("/api/bots", { name: "Election B" })).bot;
    const third = (await api("/api/bots", { name: "Election C" })).bot;
    const room = (await api("/api/groups", { name: "Voting room", memberIds: [info.botId, second.id, third.id] })).group;
    await api(`/api/groups/${room.id}/setup`, { action: "skip" }, "PATCH");
    await expect.poll(snapshot, { timeout: 15_000 }).toContain("Voting room");
    await click("Voting room");
    await click("Manage members");
    await expect.poll(snapshot).toContain("Room judge");
    await click("Judge provider");
    await ui("press", "--keys", "ArrowDown");
    await ui("press", "--keys", "Enter");
    await expect.poll(snapshot).toContain("Judge model");
    await click("Save ·");
    const saved = (await api("/api/bots?messages=0")).groups.find((g: any) => g.id === room.id);
    expect(saved.judgeModelSelection?.model).toBeTruthy();
    await ui("type", "--name", "Message Voting room", "--text", "Please answer using the evidence in our discussion.");
    await ui("press", "--keys", "Enter");
    await expect.poll(snapshot, { timeout: 10_000 }).toContain("Voting room is typing");
    const proposing = await snapshot();
    await expect.poll(async () => (await api(`/api/threads/${room.threadId}/messages`)).messages.find((message: any) => message.goalRun?.election)?.goalRun?.election?.phase,
      { timeout: 15_000, interval: 50 }).toBe("judging");
    expect(await snapshot()).toContain("Voting room is typing");
    const judging = await snapshot();
    await expect.poll(snapshot, { timeout: 30_000 }).toContain("Elected reply fixture: the requested answer is ready.");
    await expect.poll(async () => {
      const transcript = await api(`/api/threads/${room.threadId}/messages`);
      return transcript.messages.find((message: any) => message.goalRun?.election)?.goalRun?.election?.phase;
    }, { timeout: 30_000 }).toBe("completed");
    const final = await snapshot();
    expect(final).not.toContain("Voting room is typing");
    expect(final).toContain("Please answer using the evidence in our discussion.");
    expect(final).toContain("Room discussion: Completed");
    expect(final).toContain("Proposals and judge");
    await click("Proposals and judge");
    const expanded = await snapshot();
    expect(expanded).toContain("This member should supply the missing answer");
    expect(expanded).toContain("The judge selected");
    await click("You");
    await click("Settings");
    await click("Appearance");
    await click("Show discussion cards in group chats");
    await ui("press", "--keys", "Escape");
    const hidden = await snapshot();
    expect(hidden).not.toContain("Room discussion: Completed");
    expect(hidden).toContain("Elected reply fixture: the requested answer is ready.");
    await click("You");
    await click("Settings");
    await click("Appearance");
    await click("Show discussion cards in group chats");
    await ui("press", "--keys", "Escape");
    const restored = await snapshot();
    expect(restored).toContain("Room discussion: Completed");
    const screenshot = await ui("screenshot", "--out", info.logPath + ".room-election.png");
    const transcript = await api(`/api/threads/${room.threadId}/messages`);
    const rounds = transcript.messages.find((message: any) => message.goalRun?.election).goalRun.election.rounds;
    expect(rounds[0].proposals).toHaveLength(3);
    expect(rounds[0].votes).toHaveLength(0);
    expect(rounds[0].judge.reason).toBeTruthy();
    writeFileSync(info.logPath + ".room-election-ui.json", JSON.stringify({ proposing, judging, final, expanded, hidden, restored, screenshot, transcript }, null, 2));
    console.info("Room election UI evidence:", info.logPath + ".room-election-ui.json");
  } finally { await waitForExit(child, { signal: "SIGINT", graceMs: 30_000 }); rmSync(directory, { recursive: true, force: true }); }
}, 240_000);

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { resolveAgentBrowserBinary } from "../../server/browser-engine.ts";
import { waitForExit } from "../../server/testing/cleanup.ts";
import { runControlOmb } from "../control-omb.ts";
import { UI_TOOLS_DIR } from "./control-omb-ui.ts";
import { fixtureApi } from "./preview-fixture.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const enabled = process.env.OMB_UI_E2E === "1" || Boolean(resolveAgentBrowserBinary({ dataDir: UI_TOOLS_DIR, env: process.env }));

describe("existing group membership UI", () => {
  let child: ChildProcess | undefined;
  afterAll(async () => { await waitForExit(child, { signal: "SIGINT", graceMs: 30_000 }); });
  (enabled ? it : it.skip)("adds a bot, preserves history, persists, and leaves rejected edits open", async () => {
    let stdout = "";
    let stderr = "";
    child = spawn(process.execPath, ["--experimental-strip-types", join(root, "scripts/control-omb.ts"), "ui", "launch"], {
      cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout!.on("data", chunk => { stdout += chunk; });
    child.stderr!.on("data", chunk => { stderr += chunk; });
    let info!: { ui: string; url: string; botId: string; dataDir: string; logPath: string };
    await expect.poll(() => {
      if (child!.exitCode !== null) throw new Error(stderr);
      try { info = JSON.parse(stdout); return Boolean(info.ui); } catch { return false; }
    }, { timeout: 180_000 }).toBe(true);
    const ui = (verb: string, ...args: string[]) => runControlOmb(["ui", verb, "--ui", info.ui, ...args]) as Promise<Record<string, any>>;
    const evaluate = async (js: string) => (await ui("eval", "--js", js)).result;
    const click = (name: string) => ui("click", "--name", name);
    const snapshot = async () => (await ui("snapshot")).snapshot as string;
    const api = fixtureApi(info.url);
    const added = (await runControlOmb(["new-bot", "--url", info.url, "--name", "Sage"]) as any).bot;
    const group = (await api("POST", "/api/groups", {
      name: "Membership fixture", memberIds: [info.botId],
      setup: { bulletin: "Keep this conversation", defaultResponder: { kind: "member", botId: info.botId } },
    })).group;
    const state = async () => (await api("GET", "/api/bots")).groups.find((g: any) => g.id === group.id);
    await expect.poll(() => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Membership fixture')); button?.click(); return !!button; })()`)).toBe(true);
    await ui("type", "--name", "Message Membership fixture", "--text", "Keep this group history");
    await ui("press", "--keys", "Enter");
    const settlement = await ui("wait-settle", "--timeout", "60");
    const before = await state();
    const open = () => evaluate(`document.querySelector('button[title="Manage members"]').click(); true`);
    await open();
    await click("Sage");
    await click("Cancel");
    expect((await state()).memberIds).toEqual([info.botId]);
    await open();
    await click("Sage");
    await click("Save · 2 bots");
    await expect.poll(async () => (await state()).memberIds).toEqual([info.botId, added.id]);
    expect((await state()).messages).toEqual(before.messages);
    expect((await state()).threadId).toBe(group.threadId);
    expect((await state()).defaultResponder).toEqual(before.defaultResponder);
    const saved = JSON.parse(readFileSync(join(info.dataDir, "groups.json"), "utf8"));
    expect(saved.find((g: any) => g.id === group.id).memberIds).toEqual([info.botId, added.id]);
    await open();
    expect(await snapshot()).toContain('checkbox "Sage" [checked=true');
    await click("Sage");
    // A real server-side conflict: another device changes the opened roster.
    await api("PATCH", `/api/groups/${group.id}/members`, { memberIds: [added.id], expectedMemberIds: [info.botId, added.id] });
    await click("Save · 1 bot");
    await expect.poll(snapshot).toContain("members changed");
    expect((await state()).memberIds).toEqual([added.id]);
    await click("Cancel");
    await open();
    await click("Pepper");
    // A refused request must leave both the picker and its selection intact.
    await evaluate(`(() => { const original = window.fetch.bind(window); window.fetch = (input, init) => { if (String(input).endsWith('/members') && init?.method === 'PATCH') { window.fetch = original; return Promise.resolve(new Response(JSON.stringify({error:'Fixture save failed'}), {status:409,headers:{'content-type':'application/json'}})); } return original(input, init); }; return true; })()`);
    await click("Save · 2 bots");
    await expect.poll(snapshot).toContain("Fixture save failed");
    expect((await state()).memberIds).toEqual([added.id]);
    await click("Save · 2 bots");
    await expect.poll(async () => (await state()).memberIds).toEqual([added.id, info.botId]);
    const evidence = join(root, ".omb-scratch/verify-evidence/group-members");
    mkdirSync(evidence, { recursive: true });
    await ui("screenshot", "--out", join(evidence, "desktop.png"));
    writeFileSync(join(evidence, "regression.json"), JSON.stringify({ fixture: info, settlement, before, after: await state(), snapshot: await snapshot() }, null, 2));
  }, 240_000);
});

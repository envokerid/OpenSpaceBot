import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { resolveAgentBrowserBinary } from "../../server/browser-engine.ts";
import { waitForExit } from "../../server/testing/cleanup.ts";
import { runControlOmb } from "../control-omb.ts";
import { UI_TOOLS_DIR } from "./control-omb-ui.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const enabled = process.env.OMB_UI_E2E === "1" || Boolean(resolveAgentBrowserBinary({ dataDir: UI_TOOLS_DIR, env: process.env }));

describe("connector account approval UI", () => {
  let child: ChildProcess | undefined;
  afterAll(async () => { await waitForExit(child, { signal: "SIGINT", graceMs: 30_000 }); });
  (enabled ? it : it.skip)("assigns and revokes named accounts from both views and persists the result", async () => {
    let stdout = "";
    let stderr = "";
    child = spawn(process.execPath, ["--experimental-strip-types", join(root, "scripts/verify-connector-accounts.ts")], {
      cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout!.on("data", (chunk) => { stdout += chunk; });
    child.stderr!.on("data", (chunk) => { stderr += chunk; });
    let info: { ui: string; url: string; botId: string; dataDir: string; logPath: string };
    await expect.poll(() => {
      if (child!.exitCode !== null) throw new Error(stderr);
      try { info = JSON.parse(stdout); return Boolean(info.ui); } catch { return false; }
    }, { timeout: 180_000 }).toBe(true);
    const ui = (verb: string, ...args: string[]) => runControlOmb(["ui", verb, "--ui", info.ui, ...args]) as Promise<Record<string, any>>;
    const click = (name: string) => ui("click", "--name", name);
    const snapshot = async () => (await ui("snapshot")).snapshot as string;
    const bots = async () => (await fetch(`${info.url}/api/bots`).then((r) => r.json())).bots as Array<{ id: string; name: string; connectorAccounts?: Record<string, string[]> }>;
    const accounts = async () => (await bots()).find((bot) => bot.id === info.botId)?.connectorAccounts ?? {};
    const openProfile = async () => {
      const state = await ui("snapshot", "--interactive");
      const ref = Object.entries(state.refs as Record<string, { name: string; role: string }>).find(([, entry]) => entry.role === "button" && entry.name === "Open Pepper's profile")![0];
      await ui("click", "--ref", `@${ref}`);
      await click("Access");
    };
    await openProfile();
    await click("Add connector account");
    await click("gmail · work ca_work");
    await expect.poll(accounts).toEqual({ gmail: ["ca_work"] });
    expect(await snapshot()).toContain("Remove gmail work");
    await click("Connect an app…");
    await expect.poll(snapshot).toContain("Remove Pepper from work");
    await click("Add bots to personal");
    await click("Pepper");
    await expect.poll(accounts).toEqual({ gmail: ["ca_work", "ca_personal"] });
    expect((await bots()).filter((bot) => bot.id !== info.botId).every((bot) => !bot.connectorAccounts)).toBe(true);
    await click("Remove Pepper from work");
    await expect.poll(accounts).toEqual({ gmail: ["ca_personal"] });
    await click("Close plugins");
    await openProfile();
    expect(await snapshot()).toContain("Remove gmail personal");
    expect(await snapshot()).not.toContain("Remove gmail work");
    await click("Remove gmail personal");
    await expect.poll(accounts).toEqual({});
    await expect.poll(snapshot).toContain("No accounts approved.");
    // A rejected write is visible and must never look approved.
    await click("Add connector account");
    await ui("eval", "--js", `(() => { const original = window.fetch.bind(window); window.fetch = (input, init) => { if (String(input).includes('/connector-accounts/') && init?.method === 'POST') { window.fetch = original; return Promise.resolve(new Response(JSON.stringify({error:'Fixture approval failed'}), {status:409,headers:{'content-type':'application/json'}})); } return original(input, init); }; return true; })()`);
    await click("gmail · work ca_work");
    await expect.poll(snapshot).toContain("Fixture approval failed");
    expect(await accounts()).toEqual({});
    await click("gmail · work ca_work");
    await expect.poll(accounts).toEqual({ gmail: ["ca_work"] });
    const saved = JSON.parse(readFileSync(join(info!.dataDir, "bots.json"), "utf8"));
    expect(saved.find((bot: { id: string }) => bot.id === info!.botId).connectorAccounts).toEqual({ gmail: ["ca_work"] });
    const console = await ui("console");
    expect(console.messages.filter((message: { type: string }) => message.type === "error")).toEqual([]);
    const evidence = join(root, ".omb-scratch/verify-evidence/connector-accounts");
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, "regression.json"), JSON.stringify({ fixture: info!, accounts: await accounts(), snapshot: await snapshot(), console }, null, 2));
  }, 240_000);
});

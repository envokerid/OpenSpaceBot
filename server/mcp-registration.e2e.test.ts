import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, openSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { waitForExit } from "./testing/cleanup.ts";
import { launchVerificationServer, runControlOmb, verificationServerEnvironment } from "../scripts/control-omb.ts";

const command = { command: process.execPath, args: ["--experimental-strip-types", fileURLToPath(new URL("./testing/fake-mcp-server.ts", import.meta.url))] };
async function fixture(run: (f: any) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "omb-registration-"));
  const gate = join(dir, "finish");
  const server = await launchVerificationServer({ ...process.env, FAKE_CLAUDE_MODE: "slow", FAKE_CLAUDE_SLOW_FINISH_GATE: gate });
  let restarted: ChildProcess | undefined;
  const evidence: unknown[] = [{ fixture: server.info }];
  const api = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(`${server.info.url}${path}`, { method, headers: { "content-type": "application/json", origin: server.info.url, ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = { status: res.status, body: await res.json() };
    evidence.push({ method, path, ...result });
    return result;
  };
  const control = async (args: string[]) => {
    const result = await runControlOmb([...args, "--url", server.info.url]);
    evidence.push({ command: args, result }); return result;
  };
  const dump = async () => {
    await expect.poll(() => existsSync(server.fixtureDumpPath), { timeout: 15000 }).toBe(true);
    return JSON.parse(readFileSync(server.fixtureDumpPath, "utf8"));
  };
  const grantFull = async (botId: string) => {
    await waitForExit(restarted ?? server.child, { signal: "SIGTERM" });
    const path = join(server.info.dataDir, "bots.json");
    const bots = JSON.parse(readFileSync(path, "utf8"));
    const bot = bots.find((row: any) => row.id === botId);
    bot.approvalMode = "full"; bot.autoApprove = false;
    for (const task of bot.tasks) { task.approvalMode = "full"; task.autoApprove = false; }
    writeFileSync(path, JSON.stringify(bots));
    const dataDir = server.info.dataDir;
    const log = openSync(server.info.logPath, "a", 0o600);
    restarted = spawn(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("./index.ts", import.meta.url))], {
      cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: ["ignore", log, log],
      env: verificationServerEnvironment({ FAKE_CLAUDE_MODE: "slow", FAKE_CLAUDE_SLOW_FINISH_GATE: gate }, dataDir, Number(new URL(server.info.url).port)),
    });
    closeSync(log);
    await expect.poll(async () => {
      try { return (await fetch(server.info.url + "/api/health")).ok; } catch { return false; }
    }, { timeout: 20000 }).toBe(true);
  };
  try { await run({ api, control, dump, gate, server, evidence, grantFull }); }
  finally {
    if (restarted) await waitForExit(restarted, { signal: "SIGTERM" });
    await server.close(); rmSync(dir, { recursive: true, force: true });
    const evidencePath = `${server.info.logPath}.registration.json`;
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.info(JSON.stringify({ evidencePath, fixtureRemoved: !existsSync(server.info.dataDir) }));
  }
}

it("registers durably, resumes with new tools, and never grants another bot access", async () => {
  await fixture(async ({ api, control, dump, gate, server, evidence, grantFull }) => {
    const { bot } = await control(["new-bot", "--name", "Registrar"]);
    expect((await api("PATCH", `/api/bots/${bot.id}`, { computer: "off", browser: false, mcpServers: [] })).status).toBe(200);
    await grantFull(bot.id);
    await control(["send", "--bot", bot.id, "--text", "Set up notes and continue."]);
    const before = await dump(); const token = before.mcpConfig.mcpServers.agents.env.OMB_COMMS_TOKEN;
    const register = (body: unknown) => api("POST", "/api/internal/mcp/servers", body, token);
    expect((await register({ name: "agents", ...command })).status).toBe(400);
    expect((await register({ name: "foreign", ...command, ownerBotId: "other" })).status).toBe(400);
    expect((await register({ name: "wrongvm", ...command, vmId: "unassigned" })).status).toBe(403);
    expect((await register({ name: "broken", command: "/missing-fixture-command" })).status).toBe(422);
    const spec = { name: "notes", ...command, env: { TOKEN: "fixture-private-token", FAKE_MCP_DESCRIPTION: "Reads fixture-private-token" } };
    const registered = await register(spec);
    expect(registered).toMatchObject({ status: 201, body: { ok: true, activation: "resume_after_turn", tools: [{ name: "read_notes" }] } });
    expect(JSON.stringify(registered)).not.toContain("fixture-private-token");
    expect((await register(spec)).status).toBe(200);
    expect((await register({ ...spec, args: [] })).status).toBe(409);
    const listed = await api("GET", "/api/internal/mcp/servers", undefined, token);
    expect(listed.body.servers).toEqual([expect.objectContaining({ name: "notes", ownerBotId: bot.id, enabled: true })]);
    expect(JSON.stringify(listed)).not.toContain("fixture-private-token");
    const config = JSON.parse(readFileSync(join(server.info.dataDir, "config.json"), "utf8"));
    expect(config.mcpServers.notes).toMatchObject({ ownerBotId: bot.id, enabled: true, command: process.execPath });
    writeFileSync(gate, "finish");
    await expect.poll(async () => (await dump()).pid, { timeout: 15000 }).not.toBe(before.pid);
    const after = await dump();
    expect(after.mcpConfig.mcpServers.notes.command).toBe(process.execPath);
    evidence.push({ refreshed: true, mounted: Object.keys(after.mcpConfig.mcpServers) });
    expect((await control(["wait", "--bot", bot.id, "--timeout", "30"])).status).toBe("settled");
    expect((await register({ name: "expired", ...command })).status).toBe(401);
    const { bot: peer } = await control(["new-bot", "--name", "Other bot"]);
    rmSync(server.fixtureDumpPath, { force: true });
    await control(["send", "--bot", peer.id, "--text", "Reply briefly."]);
    expect((await dump()).mcpConfig.mcpServers.notes).toBeUndefined();
    await control(["wait", "--bot", peer.id, "--timeout", "30"]);
    // Restart on the fixture's retained data, then prove both persistence and
    // the independent room continuation path with computer access disabled.
    await grantFull(bot.id);
    expect((await api("GET", "/api/mcp/servers")).body.servers[0]).toMatchObject({ name: "notes", ownerBotId: bot.id });
    const { channel } = await control(["new-channel", "--name", "Registration room", "--members", bot.id]);
    rmSync(gate); rmSync(server.fixtureDumpPath, { force: true });
    await control(["send-channel", "--channel", channel.id, "--text", "Register the room helper and continue."]);
    const roomBefore = await dump();
    expect(roomBefore.mcpConfig.mcpServers.notes.command).toBe(process.execPath);
    const roomToken = roomBefore.mcpConfig.mcpServers.agents.env.OMB_COMMS_TOKEN;
    expect(await api("POST", "/api/internal/mcp/servers", { name: "room-helper", ...command }, roomToken)).toMatchObject({ status: 201, body: { activation: "resume_after_turn" } });
    writeFileSync(gate, "finish");
    await expect.poll(async () => (await dump()).pid, { timeout: 15000 }).not.toBe(roomBefore.pid);
    expect((await dump()).mcpConfig.mcpServers["room-helper"].command).toBe(process.execPath);
    expect((await control(["wait", "--channel", channel.id, "--timeout", "30"])).status).toBe("settled");
    evidence.push({ restartPersistence: true, roomToolsRefreshed: true });
  });
}, 90000);

it("requires approval outside Full Access and cancels registration when the turn stops", async () => {
  await fixture(async ({ api, control, dump }) => {
    const { bot } = await control(["new-bot", "--name", "Asker"]);
    expect((await api("PATCH", `/api/bots/${bot.id}`, { computer: "off", browser: false, approvalMode: "ask" })).status).toBe(200);
    await control(["send", "--bot", bot.id, "--text", "Set up notes."]);
    const agentEnv = (await dump()).mcpConfig.mcpServers.agents.env;
    const token = agentEnv.OMB_COMMS_TOKEN;
    const threadId = agentEnv.OMB_THREAD_ID;
    const register = (name: string) => api("POST", "/api/internal/mcp/servers", { name, ...command }, token);
    const card = async (name: string) => {
      let found: any;
      await expect.poll(async () => {
        const bots = (await api("GET", "/api/bots?messages=50")).body.bots;
        found = bots.find((row: any) => row.id === bot.id)?.messages.find((m: any) => m.card?.tool === "register_mcp_server" && m.card?.title.includes(name));
        return Boolean(found);
      }, { timeout: 10000 }).toBe(true);
      expect(found.card.options).toEqual(["Allow", "Deny"]); return found.card;
    };
    const denied = register("denied");
    const first = await card("denied");
    expect((await api("GET", "/api/mcp/servers")).body.servers).toEqual([]);
    expect((await api("POST", `/api/threads/${threadId}/respond`, { requestId: first.requestId, behavior: "deny" })).status).toBe(200);
    expect((await denied).status).toBe(403);
    const allowed = register("allowed"); const second = await card("allowed");
    await api("POST", `/api/threads/${threadId}/respond`, { requestId: second.requestId, behavior: "allow" });
    expect((await allowed).status).toBe(201);
    const cancelled = register("cancelled"); await card("cancelled");
    await control(["interrupt", "--bot", bot.id]);
    expect([401, 403]).toContain((await cancelled).status);
    expect((await api("GET", "/api/mcp/servers")).body.servers.map((s: any) => s.name)).toEqual(["allowed"]);
  });
}, 90000);

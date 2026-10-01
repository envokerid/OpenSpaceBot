import { existsSync, readFileSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { join } from "node:path";
import { expect, it } from "vitest";

import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";
import { CONNECTOR_EXECUTE_TOOL } from "../shared/approved-commands.ts";

it("persists per-bot approved commands through the administrator settings API", async () => {
  const fixture = await launchVerificationServer();
  const { url } = fixture.info;
  const request = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: url },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const created = await runControlOmb(["new-bot", "--name", "Pepper", "--url", url]) as any;
    const initial = await request("GET", "/api/settings/approved-commands");
    expect(initial.status).toBe(200);
    expect(initial.body.tools).toContain(CONNECTOR_EXECUTE_TOOL);
    expect(initial.body.bots).toContainEqual({
      id: created.bot.id,
      name: "Pepper",
      approvals: {},
    });

    const revoked = await request("PATCH", "/api/settings/approved-commands", {
      botId: created.bot.id,
      tool: "mcp__connectors__CONNECTORS_EXECUTE_TOOL",
      approved: false,
    });
    expect(revoked.status).toBe(200);
    expect(revoked.body.bots.find((bot: any) => bot.id === created.bot.id).approvals)
      .toEqual({ [CONNECTOR_EXECUTE_TOOL]: false });

    const allowed = await request("PATCH", "/api/settings/approved-commands", {
      botId: created.bot.id,
      tool: "mcp__notes__search",
      approved: true,
    });
    expect(allowed.status).toBe(200);
    expect(allowed.body.tools).toContain("mcp__notes__search");
    expect(allowed.body.bots.find((bot: any) => bot.id === created.bot.id).approvals)
      .toMatchObject({ [CONNECTOR_EXECUTE_TOOL]: false, "mcp__notes__search": true });
    const saved = JSON.parse(readFileSync(join(fixture.info.dataDir, "bots.json"), "utf8"));
    expect(saved.find((bot: any) => bot.id === created.bot.id).mcpToolApprovals)
      .toMatchObject({ [CONNECTOR_EXECUTE_TOOL]: false, "mcp__notes__search": true });

    const invalid = await request("PATCH", "/api/settings/approved-commands", {
      botId: created.bot.id,
      tool: "bad\ntool",
      approved: true,
    });
    expect(invalid.status).toBe(400);

    const peer = await runControlOmb(["new-bot", "--name", "Peer", "--url", url]) as any;
    const tool = "mcp__notes__write";
    const selected = await request("PATCH", "/api/settings/approved-commands", {
      botIds: [created.bot.id], tool, approved: true,
    });
    expect(selected.status).toBe(200);
    expect(selected.body.bots.find((bot: any) => bot.id === peer.bot.id).approvals[tool]).toBeUndefined();
    const rejected = await request("PATCH", "/api/settings/approved-commands", {
      botIds: [peer.bot.id, "missing-bot"], tool, approved: true, includeNewBots: true,
    });
    expect(rejected.status).toBe(404);
    const unchanged = await request("GET", "/api/settings/approved-commands");
    expect(unchanged.body.newBotApprovals[tool]).toBeUndefined();
    expect(unchanged.body.bots.find((bot: any) => bot.id === peer.bot.id).approvals[tool]).toBeUndefined();

    const all = await request("PATCH", "/api/settings/approved-commands", {
      allBots: true, tool, approved: true, includeNewBots: false,
    });
    expect(all.status).toBe(200);
    expect(all.body.bots.every((bot: any) => bot.approvals[tool] === true)).toBe(true);
    const later = await runControlOmb(["new-bot", "--name", "Later", "--url", url]) as any;
    const beforeDefault = await request("GET", "/api/settings/approved-commands");
    expect(beforeDefault.body.bots.find((bot: any) => bot.id === later.bot.id).approvals[tool]).toBe(false);

    const allAndFuture = await request("PATCH", "/api/settings/approved-commands", {
      allBots: true, tool, approved: true, includeNewBots: true,
    });
    expect(allAndFuture.status).toBe(200);
    const future = await runControlOmb(["new-bot", "--name", "Future", "--url", url]) as any;
    const afterDefault = await request("GET", "/api/settings/approved-commands");
    expect(afterDefault.body.bots.find((bot: any) => bot.id === future.bot.id).approvals[tool]).toBe(true);
    expect(JSON.parse(readFileSync(join(fixture.info.dataDir, "config.json"), "utf8")).mcpToolDefaults[tool]).toBe(true);

    await request("PATCH", "/api/settings/approved-commands", { botId: peer.bot.id, tool, approved: false });
    const disableFuture = await request("PATCH", "/api/settings/approved-commands", {
      botIds: [], tool, approved: true, includeNewBots: false,
    });
    expect(disableFuture.status).toBe(200);
    expect(disableFuture.body.bots.find((bot: any) => bot.id === future.bot.id).approvals[tool]).toBe(true);
    expect(disableFuture.body.bots.find((bot: any) => bot.id === peer.bot.id).approvals[tool]).toBe(false);
    const last = await runControlOmb(["new-bot", "--name", "Last", "--url", url]) as any;
    const final = await request("GET", "/api/settings/approved-commands");
    expect(final.body.bots.find((bot: any) => bot.id === last.bot.id).approvals[tool]).toBe(false);
  } finally {
    await fixture.close();
  }
}, 40_000);

it("uses an explicit connector execution approval until the bot grant is revoked", async () => {
  const fixture = await launchVerificationServer({ ...process.env, FAKE_CLAUDE_MODE: "hang" });
  const { url } = fixture.info;
  const request = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: url },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, body: await response.json() as any };
  };
  const openAsk = async (socketPath: string, id: string, tool = "mcp__connectors__CONNECTORS_EXECUTE_TOOL") => {
    const socket = connect(socketPath);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    let buffer = "";
    const answer = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`broker ask ${id} was not answered`)), 10_000);
      socket.on("data", (chunk) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline === -1) return;
        clearTimeout(timer);
        resolve(JSON.parse(buffer.slice(0, newline)));
      });
      socket.once("error", reject);
    });
    socket.write(JSON.stringify({
      t: "ask",
      id,
      tool,
      input: { tools: [{ slug: "fixture" }] },
    }) + "\n");
    return { socket, answer };
  };
  const sockets: Socket[] = [];
  try {
    const futureTool = "mcp__notes__lookup";
    const defaultGrant = await request("PATCH", "/api/settings/approved-commands", {
      botIds: [], tool: futureTool, approved: true, includeNewBots: true,
    });
    expect(defaultGrant.status).toBe(200);
    const created = await runControlOmb(["new-bot", "--name", "Broker Probe", "--url", url]) as any;
    const bots = await request("GET", "/api/bots?messages=0");
    const bot = bots.body.bots.find((candidate: any) => candidate.id === created.bot.id);
    expect(bot?.threadId).toBeTruthy();
    await runControlOmb(["send", "--bot", bot.id, "--task", bot.threadId, "--text", "wait for fixture permissions", "--url", url]);
    await expect.poll(() => existsSync(fixture.fixtureDumpPath), { timeout: 10_000 }).toBe(true);
    const dump = JSON.parse(readFileSync(fixture.fixtureDumpPath, "utf8"));
    const args = dump.mcpConfig?.mcpServers?.ogb?.args;
    expect(Array.isArray(args)).toBe(true);
    const socketPath = args.at(-1);
    expect(typeof socketPath).toBe("string");

    const inherited = await openAsk(socketPath, "inherited-by-new-bot", futureTool);
    sockets.push(inherited.socket);
    await expect(inherited.answer).resolves.toMatchObject({ behavior: "allow" });

    expect((await request("PATCH", "/api/settings/approved-commands", { botId: bot.id, tool: CONNECTOR_EXECUTE_TOOL, approved: true })).status).toBe(200);
    const first = await openAsk(socketPath, "approved-default");
    sockets.push(first.socket);
    await expect(first.answer).resolves.toMatchObject({ behavior: "allow" });
    await expect.poll(async () => {
      const decisions = await request("GET", "/api/decisions");
      return decisions.body.decisions?.some((row: any) =>
        row.requestId === "approved-default" && row.source === "approved-command");
    }).toBe(true);

    const revoked = await request("PATCH", "/api/settings/approved-commands", {
      botId: bot.id,
      tool: CONNECTOR_EXECUTE_TOOL,
      approved: false,
    });
    expect(revoked.status).toBe(200);

    const second = await openAsk(socketPath, "revoked-default");
    sockets.push(second.socket);
    await expect.poll(async () => {
      const messages = await request("GET", `/api/threads/${bot.threadId}/messages?limit=100`);
      return messages.body.messages?.some((message: any) =>
        message.card?.requestId === "revoked-default" && message.card?.mcpTool === true);
    }).toBe(true);
    const response = await request("POST", `/api/threads/${bot.threadId}/respond`, {
      requestId: "revoked-default",
      behavior: "allow",
    });
    expect(response.status).toBe(200);
    await expect(second.answer).resolves.toMatchObject({ behavior: "allow" });

    const bulkApproval = await request("PATCH", "/api/settings/approved-commands", {
      allBots: true, tool: CONNECTOR_EXECUTE_TOOL, approved: true, includeNewBots: true,
    });
    expect(bulkApproval.status).toBe(200);
    const third = await openAsk(socketPath, "approved-for-all");
    sockets.push(third.socket);
    await expect(third.answer).resolves.toMatchObject({ behavior: "allow" });
  } finally {
    for (const socket of sockets) socket.destroy();
    await fixture.close();
  }
}, 40_000);

import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OPENCLAW_VERSION, startConnectorGateway, type ConnectorGateway } from "./openclaw-gateway.ts";

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture port");
  return `http://127.0.0.1:${address.port}`;
}

describe("pinned OpenClaw connector adapter", () => {
  it("discovers and executes through OpenClaw, including OpenClaw-owned OAuth and PKCE", async () => {
    const directory = mkdtempSync(join(tmpdir(), "omb-openclaw-contract-"));
    let gateway: ConnectorGateway | undefined;
    let origin = "";
    let oauth = false;
    let challenge = "";
    let authorizedCalls = 0;
    let tokenExchanges = 0;
    const remote = createServer(async (req, res) => {
      const url = new URL(req.url!, origin);
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const json = (value: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
      if (url.pathname.includes("oauth-protected-resource")) return json({ resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: ["tools"] });
      if (url.pathname.includes("oauth-authorization-server") || url.pathname.includes("openid-configuration")) return json({ issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] });
      if (url.pathname === "/register") return json({ ...JSON.parse(raw), client_id: "fixture-client", token_endpoint_auth_method: "none" }, 201);
      if (url.pathname === "/authorize") {
        challenge = url.searchParams.get("code_challenge")!;
        const callback = new URL(url.searchParams.get("redirect_uri")!);
        callback.searchParams.set("state", url.searchParams.get("state")!);
        callback.searchParams.set("code", "fixture-code");
        res.writeHead(302, { location: callback.href }); return res.end();
      }
      if (url.pathname === "/token") {
        const form = new URLSearchParams(raw);
        if (form.get("code") !== "fixture-code" || createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") !== challenge) return json({ error: "invalid_grant" }, 400);
        tokenExchanges++;
        return json({ access_token: "fixture-access-token", token_type: "Bearer", expires_in: 3600, scope: "tools" });
      }
      if (url.pathname !== "/mcp") return json({ error: "not found" }, 404);
      if (oauth && req.headers.authorization !== "Bearer fixture-access-token") {
        res.setHeader("www-authenticate", `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`);
        return json({ error: "authorization_required" }, 401);
      }
      if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
      const message = JSON.parse(raw);
      if (message.id === undefined) { res.writeHead(202); return res.end(); }
      const result = message.method === "initialize" ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "connector-fixture", version: "1" } }
        : message.method === "tools/list" ? { tools: [{ name: "echo", description: "Fixture echo", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } }] }
        : { content: [{ type: "text", text: message.params.arguments.text }] };
      if (message.method === "tools/call") authorizedCalls++;
      return json({ jsonrpc: "2.0", id: message.id, result });
    });
    try {
      origin = await listen(remote);
      gateway = await startConnectorGateway(directory);
      const configure = async (server: unknown) => {
        const snapshot = await gateway!.request<{ hash: string }>("config.get", {});
        await gateway!.request("config.patch", { baseHash: snapshot.hash, raw: JSON.stringify({ gateway: { publicOrigin: origin }, mcp: { servers: { connected_account: server } } }) });
      };
      await configure({ url: `${origin}/mcp`, transport: "streamable-http" });
      const catalog = await gateway.request<{ tools: Array<{ name: string; inputSchema: unknown }> }>("omb.connectors.tools", {});
      expect(catalog.tools).toHaveLength(1);
      expect(catalog.tools[0].inputSchema).toMatchObject({ required: ["text"] });
      const call = await gateway.request("omb.connectors.call", { name: catalog.tools[0].name, arguments: { text: "through-openclaw" } });
      expect(JSON.stringify(call)).toContain("through-openclaw");
      expect(authorizedCalls).toBe(1);
      await expect(gateway.request("omb.connectors.call", { name: "exec", arguments: { command: "echo forbidden" } })).rejects.toThrow();
      expect(authorizedCalls).toBe(1);
      oauth = true;
      await configure({ url: `${origin}/mcp`, transport: "streamable-http", auth: "oauth", oauth: { identity: "per-requester" } });
      const auth = await gateway.request<{ connected: boolean; authorizationUrl: string }>("omb.connectors.authorize", {});
      expect(auth.connected).toBe(false);
      const authorization = new URL(auth.authorizationUrl);
      expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
      const handoff = await fetch(authorization, { redirect: "manual" });
      const callback = new URL(handoff.headers.get("location")!);
      await expect(gateway.completeOAuth("?state=wrong&code=fixture-code")).rejects.toThrow();
      expect(tokenExchanges).toBe(0);
      await gateway.completeOAuth(callback.search);
      expect(tokenExchanges).toBe(1);
      await expect(gateway.completeOAuth(callback.search)).rejects.toThrow();
      const authorized = await gateway.request("omb.connectors.tools", {});
      expect(JSON.stringify(authorized)).toContain("echo");
      expect(JSON.stringify(authorized)).not.toContain("fixture-access-token");
    } finally {
      await gateway?.stop();
      remote.closeAllConnections();
      await new Promise<void>(resolve => remote.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    }
  }, 180_000);
  it("validates native plugin configuration and tool routing without provider credentials", async () => {
    const directory = mkdtempSync(join(tmpdir(), "omb-openclaw-native-"));
    let gateway: ConnectorGateway | undefined;
    try {
      gateway = await startConnectorGateway(directory);
      const external = process.env.OMB_VERIFY_OPENCLAW_PLUGINS === "1" ? ["slack", "discord", "whatsapp"] : [];
      for (const id of external) {
        const installed = await gateway.request("plugins.install", { source: "npm", spec: `@openclaw/${id}@${OPENCLAW_VERSION}`, pin: true, expectedPluginId: id });
        expect(installed.ok).toBe(true);
      }
      const snapshot = await gateway.request<{ hash: string }>("config.get", {});
      await gateway.request("config.patch", { baseHash: snapshot.hash, raw: JSON.stringify({
        plugins: { allow: ["openmausbot-connectors", "telegram", ...external], entries: Object.fromEntries(["telegram", ...external].map(id => [id, { enabled: true }])) },
        channels: Object.fromEntries(["telegram", ...external].map(id => [id, { enabled: true, dmPolicy: "disabled", groupPolicy: "disabled", ...(id !== "whatsapp" ? { joinIntro: false } : {}) }])),
      }) });
      const configured = await gateway.request<{ valid: boolean }>("config.get", {});
      expect(configured.valid).toBe(true);
      await expect.poll(async () => (await gateway!.request<{ channelOrder: string[] }>("channels.status", { probe: false })).channelOrder,
        { timeout: 60_000, interval: 1_000 }).toEqual(expect.arrayContaining(["telegram", ...external]));
      const missing = await gateway.request<{ ok: boolean; error: { code: string } }>("tools.invoke", { name: "nonexistent_fixture_tool", args: {} });
      expect(missing).toMatchObject({ ok: false, error: { code: "not_found" } });
      const send = await gateway.request<{ ok: boolean; error: { code: string; message: string } }>("tools.invoke", {
        name: "message", args: { action: "send", channel: "telegram", accountId: "default", target: "123456789", message: "fixture" },
      });
      expect(send).toMatchObject({ ok: false, error: { code: "internal_error", message: "tool execution failed" } });
      // Gateway deliberately redacts provider failures from the public RPC.
      await expect.poll(() => readFileSync(join(directory, "gateway.log"), "utf8"),
        { timeout: 5_000 }).toContain("Telegram bot token missing");
    } catch (error) {
      const log = ["gateway.log", "startup.log"].map(name => join(directory, name)).find(existsSync);
      const messages = log ? readFileSync(log, "utf8").trim().split("\n").slice(-15) : ["No fixture log"];

      console.error("Native plugin fixture diagnostics:", messages);
      throw error;
    } finally { await gateway?.stop(); rmSync(directory, { recursive: true, force: true }); }
  }, 960_000);

});

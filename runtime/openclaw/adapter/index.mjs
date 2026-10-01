// The sole experimental SDK boundary. Pin this plugin with the OpenClaw
// runtime and exercise it against real MCP/OAuth fixtures before upgrades.
// OpenClaw owns transport sessions, schemas, OAuth PKCE, tokens and refresh.
import { materializeRequesterScopedMcpToolsForHarnessRun } from "openclaw/plugin-sdk/agent-harness-runtime";
import { materializeStaticMcpToolsForHarnessRun } from "openclaw/plugin-sdk/codex-mcp-projection";
import { randomUUID } from "node:crypto";

export default {
  id: "openmausbot-connectors",
  register(api) {
    const accountId = api.pluginConfig?.accountId;
    if (typeof accountId !== "string" || !accountId) throw new Error("Missing connector account identity");
    async function withTools(operation) {
      const cfg = api.runtime.config.current();
      const server = cfg.mcp?.servers?.connected_account;
      if (!server || server.enabled === false) throw new Error("Account is not configured");
      // Only the authenticated owner backend can reach these admin RPCs.
      // Each profile has exactly one account. Bots never supply this identity.
      const params = {
        cfg, sessionId: `omb-connector-${accountId}`, sessionKey: "agent:main:main", agentId: "main",
        workspaceDir: cfg.agents.defaults.workspace,
        requesterSenderId: accountId,
        // OpenMausBot's per-turn engine approval precedes the backend request.
        // There is no autonomous agent run in this connector profile.
        autoApproveCodexAppServerApprovals: true,
      };
      const surface = server.oauth?.identity === "per-requester"
        ? await materializeRequesterScopedMcpToolsForHarnessRun(params)
        : await materializeStaticMcpToolsForHarnessRun(params);
      try {
        if (!surface) throw new Error("Account needs authorization");
        return await operation(surface.tools);
      } finally { await surface?.dispose(); }
    }
    function register(name, handler) {
      api.registerGatewayMethod(name, async ({ params, respond, signal }) => {
        try {
          const result = await handler(params ?? {}, signal);
          respond(true, result);
        } catch {
          // Never expose provider registration/credential response bodies.
          respond(false, undefined, { code: "UNAVAILABLE", message: "OpenClaw could not complete this connector request. Reconnect the account or check the provider permissions. An interrupted action may already have completed." });
        }
      }, { scope: "operator.admin" });
    }
    register("omb.connectors.authorize", () => withTools(async tools => {
      const bootstrap = tools.find(tool => tool.name === "connected_account__connect");
      if (!bootstrap) return { connected: true };
      const result = await bootstrap.execute(randomUUID(), {});
      const authorizationUrl = result?.details?.mcpConnect?.authorizationUrl;
      if (typeof authorizationUrl !== "string") throw new Error("No sign-in link returned");
      return { connected: false, authorizationUrl };
    }));
    register("omb.connectors.tools", () => withTools(tools => {
      if (tools.some(tool => tool.name === "connected_account__connect")) throw new Error("Sign-in required");
      const result = tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters }));
      if (result.length > 256 || JSON.stringify(result).length > 1024 * 1024) throw new Error("Tool catalogue too large");
      return { tools: result };
    }));
    register("omb.connectors.call", (params, signal) => withTools(async tools => {
      if (typeof params.name !== "string" || params.name === "connected_account__connect" || !params.arguments || typeof params.arguments !== "object" || Array.isArray(params.arguments)) throw new Error("Invalid tool invocation");
      const tool = tools.find(item => item.name === params.name);
      if (!tool || signal?.aborted) throw new Error("Tool unavailable");
      const result = await tool.execute(randomUUID(), params.arguments, signal);
      if (JSON.stringify(result).length > 1024 * 1024) throw new Error("Result too large");
      return { result };
    }));
  },
};

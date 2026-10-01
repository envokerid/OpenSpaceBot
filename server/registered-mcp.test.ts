import { describe, expect, it } from "vitest";
import { customMcpServers, type AppConfig } from "./config.ts";
import { listMcpServers, parseMcpServerMutation, parseStoredMcpServer } from "./mcp-registry.ts";
import { registeredVmExecArgs, registeredVmMcpLaunch, parseRegisteredVmMcp } from "./registered-mcp.ts";

const spec = { command: "python3", args: ["/home/cua/workspace/editor.py"], env: { API_TOKEN: "private-token", NODE_OPTIONS: "guest-only", PATH: "/guest/bin" }, enabled: true };
const vm = { ...spec, ownerBotId: "wren", vmId: "personal" };
const config = { mcpServers: { editor: vm, notes: { ...spec, ownerBotId: "wren" }, public: spec } } as unknown as AppConfig;

describe("bot-registered MCP connections", () => {
  it("keeps scoped registrations out of other bots and only mounts the selected VM", () => {
    expect(Object.keys(customMcpServers(config))).toEqual(["public"]);
    expect(Object.keys(customMcpServers(config, undefined, { botId: "other", vmId: "personal", wrapVm: value => value }))).toEqual(["public"]);
    expect(Object.keys(customMcpServers(config, undefined, { botId: "wren" }))).toEqual(["notes", "public"]);
    expect(Object.keys(customMcpServers(config, undefined, { botId: "wren", vmId: "other", wrapVm: value => value }))).toEqual(["notes", "public"]);
    expect(Object.keys(customMcpServers(config, ["editor"], { botId: "wren", vmId: "personal", wrapVm: value => value }))).toEqual(["editor"]);
    expect(customMcpServers(config, [], { botId: "wren", vmId: "personal", wrapVm: value => value })).toEqual({});
  });
  it("preserves ownership during settings edits and rejects injected or invalid scope", () => {
    // saveConfig accepts JSON values only: absent scope must stay absent,
    // including when the settings panel toggles a legacy/global server.
    expect(parseStoredMcpServer("global", spec)).toStrictEqual({ ok: true, server: spec });
    expect(parseStoredMcpServer("editor", vm)).toMatchObject({ ok: true, server: vm });
    expect(parseMcpServerMutation("editor", { ...spec, command: "node" }, vm)).toMatchObject({ ok: true, server: { ownerBotId: "wren", vmId: "personal", command: "node" } });
    expect(parseMcpServerMutation("editor", vm).ok).toBe(false);
    expect(parseStoredMcpServer("editor", { ...spec, vmId: "personal" }).ok).toBe(false);
    expect(parseStoredMcpServer("editor", { url: "http://localhost/mcp", ownerBotId: "wren", vmId: "personal" }).ok).toBe(false);
    expect(JSON.stringify(listMcpServers({ editor: vm }))).not.toContain("private-token");
    expect(listMcpServers({ editor: vm })[0]).toMatchObject({ ownerBotId: "wren", vmId: "personal" });
  });
  it("keeps guest environment out of the host launch environment and argv", () => {
    const computer = { command: "/host/node", args: ["bridge", "docker", "vm", "socket"], env: { OMB_CONTROL_TOKEN: "control-secret" } };
    const launch = registeredVmMcpLaunch(spec, computer);
    expect(launch.env.PATH).toBeUndefined();
    expect(launch.env.NODE_OPTIONS).toBeUndefined();
    expect(launch.env.API_TOKEN).toBeUndefined();
    expect(launch.env.OMB_CONTROL_TOKEN).toBe("control-secret");
    expect(parseRegisteredVmMcp(launch.env.OMB_VM_MCP_SPEC)).toMatchObject(spec);
    const args = registeredVmExecArgs("vm");
    expect(args).toContain("OMB_VM_MCP_PAYLOAD");
    expect(args).toContain("cua");
    expect(args.join(" ")).not.toContain("private-token");
    expect(args.join(" ")).not.toContain("editor.py");
    expect(() => parseRegisteredVmMcp(JSON.stringify({ ...spec, env: { OMB_CONTROL_TOKEN: "replace" } }))).toThrow();
  });
});

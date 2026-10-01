import type { StdioMcpSpec } from "./contracts.ts";
import { isRemoteMcpServer, parseStoredMcpServer, type StoredStdioMcpServer } from "./mcp-registry.ts";

// Only launches constructed by the harness may carry its reserved control
// credentials. A stored/user-supplied object cannot grant itself this trust.
const registeredLaunches = new WeakSet<object>();
export const isRegisteredVmMcpLaunch = (server: object): boolean => registeredLaunches.has(server);

/** Guest configuration stays in the private MCP environment, never in argv.
 * Reuse the computer bridge's current turn token and human-control gate. */
export function registeredVmMcpLaunch(server: StdioMcpSpec, computer: StdioMcpSpec): StdioMcpSpec {
  const launch = { ...computer, env: { ...computer.env,
    OMB_VM_MCP_SPEC: JSON.stringify({ command: server.command, args: server.args, env: server.env }) } };
  registeredLaunches.add(launch);
  return launch;
}

/** Codex supplies MCP env values through one shared parent environment.
 * Give each VM server its own payload variable so the last one cannot replace
 * every other server's command. The argv contains a variable name, no secrets. */
export function namespacedRegisteredVmMcp(server: StdioMcpSpec, name: string): StdioMcpSpec {
  if (!isRegisteredVmMcpLaunch(server)) return server;
  const key = `OMB_VM_MCP_SPEC_${Buffer.from(name).toString("hex").toUpperCase()}`;
  const { OMB_VM_MCP_SPEC, ...env } = server.env;
  return { ...server, args: [...server.args, key], env: { ...env, [key]: OMB_VM_MCP_SPEC! } };
}

export function parseRegisteredVmMcp(value: string): StoredStdioMcpServer {
  let raw: unknown;
  try { raw = JSON.parse(value); } catch { throw new Error("Invalid registered VM MCP configuration"); }
  const parsed = parseStoredMcpServer("registered-vm", raw);
  if (!parsed.ok || isRemoteMcpServer(parsed.server) || parsed.server.ownerBotId || parsed.server.vmId) throw new Error("Invalid registered VM MCP configuration");
  return parsed.server;
}

export function registeredVmExecArgs(container: string): string[] {
  return ["exec", "-i", "-u", "cua", "-w", "/home/cua/workspace",
    "-e", "HOME=/home/cua", "-e", "OMB_VM_MCP_PAYLOAD",
    container, "python3", "-I", "-c",
    'import json,os; s=json.loads(os.environ.pop("OMB_VM_MCP_PAYLOAD")); os.environ.update(s["env"]); os.execvpe(s["command"],[s["command"],*s["args"]],os.environ)'];
}

// Transparent stdio bridge into Cua Driver's official MCP server inside the
// Local VM. This process defines no tools and parses no MCP messages; the
// piping, drain-safe exit, and watchdog live in mcp-bridge.ts, shared with
// the VPS entry point.
import { cuaExecArgs } from "./container-computer.ts";
import { createControlClient } from "./control-client.ts";
import { turnToken } from "./turn-token.ts";
import { augmentedPath } from "./env-path.ts";
import { parseRegisteredVmMcp, registeredVmExecArgs } from "./registered-mcp.ts";
import { runMcpBridge } from "./mcp-bridge.ts";

const [runtime, container, socket, registeredEnvKey] = process.argv.slice(2);
if (registeredEnvKey && !/^OMB_VM_MCP_SPEC_[A-F0-9]+$/.test(registeredEnvKey)) throw new Error("Invalid VM MCP payload variable");
if (!runtime || !["docker", "podman", "container"].includes(runtime)) {
  process.stderr.write("invalid Local VM runtime\n");
  process.exit(2);
}
if (!container || !/^[a-zA-Z0-9_.-]+$/.test(container) || !socket?.startsWith("/run/user/1000/")) {
  process.stderr.write("invalid Local VM connection\n");
  process.exit(2);
}

// The who-is-driving pair rides in env, not argv — argv is world-readable
// through `ps`, and the token guards a loopback endpoint.
const controlUrl = process.env.OMB_CONTROL_URL ?? "";
const controlToken = process.env.OMB_CONTROL_TOKEN ?? "";
const tokenFile = process.env.OMB_CONTROL_TOKEN_FILE;

const registeredSpec = process.env[registeredEnvKey ?? "OMB_VM_MCP_SPEC"];
if (registeredEnvKey && !registeredSpec) throw new Error("Missing registered VM MCP configuration");
const registered = registeredSpec ? parseRegisteredVmMcp(registeredSpec) : null;
if (registered) {
  // Starting an arbitrary server executes guest code, so claim the VM before
  // spawning it, including discovery/initialization before the first tool call.
  const token = turnToken(process.env, "OMB_CONTROL_TOKEN");
  if (!controlUrl || !token) throw new Error("A registered VM server requires an active computer connection");
  const state = await createControlClient({ url: controlUrl, token }).state(true);
  if (state.held) throw new Error(state.blockedReason ?? "The VM is under human control or in use");
}
runMcpBridge({
  command: runtime,
  args: registered ? registeredVmExecArgs(container) : cuaExecArgs(["mcp", "--socket", socket], { container, interactive: true }),
  ...(registered ? { env: { ...process.env, PATH: augmentedPath(), OMB_VM_MCP_PAYLOAD: JSON.stringify({ command: registered.command, args: registered.args, env: registered.env }) } } : {}),
  label: registered ? "Registered VM MCP" : "Cua Driver",
  // No liveness watchdog: the runtime CLI talks to a local daemon and fails
  // fast on its own — there is no silent WAN peer to wedge on.
  ...(controlUrl && (controlToken || tokenFile) ? { gate: { url: controlUrl, token: controlToken, tokenFile } } : {}),
});

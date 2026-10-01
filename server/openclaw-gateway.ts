// OpenClaw stays a separate, pinned installation. Only the public Gateway
// client crosses this boundary; no plugin SDK or private runtime imports.
import { GatewayClient, GatewayClientRequestError } from "@openclaw/gateway-client";
import { randomBytes } from "node:crypto";
import { type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./atomic.ts";
import { spawnCli, killCliTree } from "./procs.ts";

export const OPENCLAW_VERSION = "2026.9.6";
export interface ConnectorGateway {
  request<T = Record<string, unknown>>(method: string, params?: unknown): Promise<T>;
  completeOAuth(query: string): Promise<void>;
  stop(): Promise<void>;
}

export function openclawRuntime() {
  const runtime = process.env.OMB_OPENCLAW_RUNTIME ?? (process.env.OMB_RESOURCES_PATH
    ? join(process.env.OMB_RESOURCES_PATH, "openclaw")
    : fileURLToPath(new URL("../runtime/openclaw", import.meta.url)));
  const nestedEntry = join(runtime, "node_modules", "openclaw", "openclaw.mjs");
  const entry = existsSync(nestedEntry) ? nestedEntry : fileURLToPath(new URL("../node_modules/openclaw/openclaw.mjs", import.meta.url));
  const bundledNode = join(runtime, process.platform === "win32" ? "node.exe" : "bin/node");
  const node = process.env.OMB_OPENCLAW_NODE ?? (existsSync(bundledNode) ? bundledNode : process.versions.electron ? "" : process.execPath);
  if (!node || !existsSync(node) || !existsSync(entry)) {
    throw new Error("The OpenClaw runtime is missing. Run pnpm build:openclaw on this server, then retry.");
  }
  const pkg = JSON.parse(readFileSync(join(dirname(entry), "package.json"), "utf8"));
  if (pkg.version !== OPENCLAW_VERSION) throw new Error(`OpenClaw ${OPENCLAW_VERSION} is required; found ${pkg.version}`);
  return { entry, node: resolve(node), adapter: join(runtime, "adapter") };
}

async function freePort(): Promise<number> {
  const listener = createServer();
  return new Promise((resolvePort, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      if (!address || typeof address === "string") return listener.close(() => reject(new Error("No gateway port")));
      listener.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

/** A separate account profile prevents a plugin's implicit/default account
 * selection from crossing an OpenMausBot account grant. This is credential
 * separation, not an OS sandbox for arbitrary third-party plugin code. */
export async function startConnectorGateway(directory: string): Promise<ConnectorGateway> {
  const { node, entry, adapter } = openclawRuntime();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const state = join(directory, "state");
  const home = join(directory, "home");
  mkdirSync(state, { recursive: true, mode: 0o700 });
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const configPath = join(directory, "openclaw.json");
  // Bootstrap only. After creation, use Gateway config.patch (with its hash)
  // and never inspect the gateway's private credential or database layouts.
  if (!existsSync(configPath)) writeFileAtomic(configPath, JSON.stringify({
    gateway: { mode: "local", bind: "loopback", auth: { mode: "token" }, controlUi: { enabled: false } },
    plugins: { allow: ["openmausbot-connectors"], load: { paths: [adapter] },
      entries: { "openmausbot-connectors": { enabled: true, config: { accountId: directory.split(/[\\/]/).at(-1) } } }, slots: { memory: "none" } },
    models: { catalogRefresh: { enabled: false } },
    agents: { defaults: { workspace: join(directory, "workspace") } },
    tools: { deny: ["exec", "process", "gateway", "nodes", "sessions_spawn", "sessions_send", "cron"] },
    discovery: { mdns: { mode: "off" } },
    commands: { native: false, nativeSkills: false },
    update: { checkOnStart: false, auto: { enabled: false } },
    logging: { file: join(directory, "gateway.log"), level: "warn", consoleLevel: "silent" },
  }), { mode: 0o600 });
  const port = await freePort();
  const token = randomBytes(32).toString("hex");
  const env: NodeJS.ProcessEnv = {
    PATH: [dirname(node), join(dirname(dirname(entry)), ".bin"), process.env.PATH ?? ""].join(process.platform === "win32" ? ";" : ":"),
    HOME: home, USERPROFILE: home,
    ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP } : {}),
    OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GATEWAY_TOKEN: token,
    OPENCLAW_DISABLE_BONJOUR: "1", OPENCLAW_EXEC_SHELL_SNAPSHOT: "0", OPENCLAW_NO_RESPAWN: "1",
    CLAWHUB_DISABLE_TELEMETRY: "1",
  };
  let child: ChildProcess;
  let client!: GatewayClient;
  let dead = false;
  let stopped = false;
  let ready = false;
  let rejectReady: (error: Error) => void = () => {};
  const connected = new Promise<void>((resolveReady, reject) => {
    rejectReady = reject;
    client = new GatewayClient({
      url: `ws://127.0.0.1:${port}`, token,
      clientName: "gateway-client", mode: "backend", role: "operator", scopes: ["operator.admin"],
      minProtocol: 4, maxProtocol: 4, requestTimeoutMs: 30_000,
      onHelloOk: () => { ready = true; resolveReady(); },
      // Refused startup sockets and startup-sidecars are retried by the
      // reference client. The outer deadline bounds every startup attempt.
      onConnectError: () => {},
      onClose: () => { ready = false; },
    });
  });
  const startupLog = openSync(join(directory, "startup.log"), "a", 0o600);
  try {
    child = spawnCli(node, [entry, "gateway", "--port", String(port)], {
      cwd: directory, env, stdio: ["ignore", startupLog, startupLog], windowsHide: true,
    });
  } finally { closeSync(startupLog); }
  const exited = new Promise<void>((resolveExit) => {
    child.once("exit", (code) => {
      dead = true;
      client.stop();
      rejectReady(new Error(code === 78 ? "OpenClaw rejected its configuration" : "OpenClaw stopped before becoming ready"));
      resolveExit();
    });
    child.once("error", () => {
      dead = true;
      client.stop();
      rejectReady(new Error("The OpenClaw process could not start"));
      resolveExit();
    });
  });
  let shutdown: Promise<void> | undefined;
  const stop = () => shutdown ??= (async () => {
    stopped = true;
    client.stop();
    // Installers and MCP helpers belong to this account too. Confirm that
    // the owned process tree has stopped before deleting its credential profile.
    if (!await killCliTree(child)) throw new Error("OpenClaw account shutdown could not be confirmed");
    await exited;
  })();
  client!.start();
  const deadline = setTimeout(() => rejectReady(new Error("OpenClaw startup timed out")), 120_000);
  try { await connected; } catch (error) { await stop(); throw error; } finally { clearTimeout(deadline); }
  return {
    completeOAuth: async (query: string) => {
      if (dead || stopped) throw new Error("The account runtime stopped. Start Connect again.");
      const params = new URLSearchParams(query);
      if (!params.get("state") || !params.get("code")) throw new Error("Invalid authorization callback");
      const response = await fetch(`http://127.0.0.1:${port}/oauth/mcp/callback?${params}`, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      await response.body?.cancel();
      if (!response.ok) throw new Error("OpenClaw rejected this authorization callback");
    },
    request: async <T>(method: string, params?: unknown): Promise<T> => {
      // A config patch can briefly restart the gateway socket. Wait for a
      // fresh handshake before dispatch, but never retry a dispatched RPC.
      const until = Date.now() + 15_000;
      while (!ready && !dead && !stopped && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50));
      if (!ready || dead || stopped) throw new Error("OpenClaw is unavailable. Reconnect before retrying; the previous action may have completed.");
      // Never replay a request after disconnect/timeout. The caller must
      // reconcile an uncertain side effect before choosing another action.
      const installDeadline = Date.now() + 300_000;
      for (;;) {
        try {
          return await client.request<T>(method, params, method === "plugins.install" ? { timeoutMs: Math.max(1, installDeadline - Date.now()) } : undefined);
        } catch (error) {
          // This exact authoritative refusal occurs before the install enters
          // its mutation lease. Never retry timeouts or uncertain dispatches.
          if (method !== "plugins.install" || !(error instanceof GatewayClientRequestError)
              || !error.retryable || error.message !== "Another plugin or config operation is already running; retry when it completes."
              || Date.now() >= installDeadline || dead || stopped) throw error;
          await new Promise(resolve => setTimeout(resolve, 1_000));
        }
      }
    },
    stop,
  };
}

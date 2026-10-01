import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Ajv } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import formats from "ajv-formats";
import { DATA_DIR, type AppConfig } from "./config.ts";
import { writeFileAtomic } from "./atomic.ts";
import { SPAWNED_PROXIES } from "./proxy-paths.ts";
import { connectorAuthFinished, type ConnectorAuthState } from "../shared/connector-auth.ts";
import type { ConnectorAccounts } from "../shared/connector-grants.ts";
import { OPENCLAW_VERSION, startConnectorGateway, type ConnectorGateway } from "./openclaw-gateway.ts";
interface RemoteConnectorSpec { url: string; auth: "oauth" | "token" | "none"; clientId?: string }
function connectorUrl(value: string): URL {
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.hash) throw new Error("Use HTTPS, or HTTP on localhost, without embedded credentials or a fragment");
  return url;
}

export interface ConnectedAccountSummary { id: string; alias?: string; status: string }
export interface ConnectorServiceState { connected: boolean; pending: boolean; status: string; accounts: ConnectedAccountSummary[] }
export interface ConnectorMcpIntegration { command: string; args: string[]; env: Record<string, string> }
export interface ToolkitCard { slug: string; label: string; blurb: string; logo: string | null; domain: string | null; noAuth?: boolean }
interface Provider extends ToolkitCard { remote?: RemoteConnectorSpec; channel?: string; fields?: NonNullable<ConnectorAuthState["fields"]> }
interface Account extends ConnectedAccountSummary { slug: string }
interface Inventory { version: 1; providers: Provider[]; accounts: Account[] }
interface AuthSession { public: ConnectorAuthState; redirectUrl: string; nonce: string; qrSessionKey?: string; busy?: Promise<void> }
type Tool = { name: string; description?: string; inputSchema: Record<string, unknown> };

const NATIVE: Provider[] = [
  { slug: "telegram", label: "Telegram", blurb: "Send messages through your Telegram bot", domain: "telegram.org", logo: null, channel: "telegram", fields: [{ key: "botToken", label: "Bot token from BotFather", secret: true }] },
  { slug: "slack", label: "Slack", blurb: "Connect your Slack app", domain: "slack.com", logo: null, channel: "slack", fields: [{ key: "botToken", label: "Bot token (xoxb-…)", secret: true }, { key: "appToken", label: "App token (xapp-…)", secret: true }] },
  { slug: "discord", label: "Discord", blurb: "Send messages through your Discord bot", domain: "discord.com", logo: null, channel: "discord", fields: [{ key: "token", label: "Bot token", secret: true }] },
  { slug: "whatsapp", label: "WhatsApp", blurb: "Pair by scanning a QR code on another screen", domain: "whatsapp.com", logo: null, channel: "whatsapp" },
];
export const CURATED_SLUGS = NATIVE.map((entry) => entry.slug);
const root = join(DATA_DIR, "connectors");
const indexPath = join(root, "accounts.json");
const sessions = new Map<string, AuthSession>();
const gateways = new Map<string, Promise<ConnectorGateway>>();
const removing = new Set<string>();
const TTL = 10 * 60_000;
// Expiry must run even if the client closes its Connect screen. Discard
// abandoned credentials and retain terminal status only for one extra TTL.
const expiry = setInterval(() => {
  for (const [id, session] of sessions) {
    if (Date.now() < session.public.expiresAt) continue;
    if (!connectorAuthFinished(session.public)) void cancelAuth(id).catch(() => {});
    else {
      if (session.public.kind !== "connected") void removeAccount({}, session.public.slug, session.public.accountId).catch(() => {});
      if (Date.now() > session.public.expiresAt + TTL) sessions.delete(id);
    }
  }
}, 30_000);
expiry.unref();
const idSchema = z.string().uuid();
const accountSchema = z.object({ id: idSchema, slug: z.string(), alias: z.string().optional(), status: z.string() });
const providerInput = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), label: z.string().trim().min(1).max(80),
  url: z.string().max(2048), auth: z.enum(["oauth", "token", "none"]), clientId: z.string().trim().max(512).optional(),
}).strict();

function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Object.assign(new Error(result.error.issues[0]?.message ?? "Invalid connector input"), { status: 400 });
  return result.data;
}
function inventory(): Inventory {
  try {
    const value = JSON.parse(readFileSync(indexPath, "utf8"));
    if (value.version !== 1 || !Array.isArray(value.providers)) throw new Error();
    return { version: 1, providers: value.providers, accounts: z.array(accountSchema).parse(value.accounts) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, providers: [], accounts: [] };
    throw new Error("The connected-account inventory could not be read. No accounts were changed.");
  }
}
function save(value: Inventory) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  writeFileAtomic(indexPath, JSON.stringify(value), { mode: 0o600 });
}
function provider(slug: string): Provider {
  const value = [...NATIVE, ...inventory().providers].find((item) => item.slug === slug);
  if (!value) throw Object.assign(new Error("This integration is not configured. Add its MCP server in Connected Apps."), { status: 404 });
  return value;
}
function account(id: string): Account {
  idSchema.parse(id);
  const value = inventory().accounts.find((entry) => entry.id === id);
  if (!value || removing.has(id)) throw Object.assign(new Error("This account was disconnected"), { status: 404 });
  return value;
}
function directory(id: string) { return join(root, "accounts", idSchema.parse(id)); }
function setStatus(id: string, status: string) {
  const data = inventory();
  const entry = data.accounts.find((item) => item.id === id);
  if (!entry || removing.has(id)) return;
  entry.status = status; save(data);
}
function assertSession(session: AuthSession) {
  account(session.public.accountId);
  if (sessions.get(session.public.id) !== session || connectorAuthFinished(session.public) || Date.now() >= session.public.expiresAt) {
    throw new Error("This connection request expired or was cancelled");
  }
}
function failSession(session: AuthSession) {
  if (sessions.get(session.public.id) !== session || connectorAuthFinished(session.public)) return;
  session.public = { ...session.public, kind: "failed", url: undefined, qrDataUrl: undefined, fields: undefined,
    error: "Connection failed. Check the provider setup and retry. Your existing accounts were not changed." };
  setStatus(session.public.accountId, "FAILED");
}
function finishSession(session: AuthSession) {
  assertSession(session);
  session.public = { ...session.public, kind: "connected", url: undefined, qrDataUrl: undefined, fields: undefined };
  setStatus(session.public.accountId, "ACTIVE");
}
function runSession(session: AuthSession, action: () => Promise<void>) {
  if (session.busy) return session.busy;
  session.busy = action().catch(() => failSession(session)).finally(() => { session.busy = undefined; });
  return session.busy;
}

export function configured(cfg: AppConfig) { return cfg.connectors?.enabled !== false; }
export function connectionMode(cfg: AppConfig): "local" | "unavailable" { return configured(cfg) ? "local" : "unavailable"; }
export function connectorAvailability(cfg: AppConfig): "configured" | "unconfigured" | "unreadable" {
  if (!configured(cfg)) return "unconfigured";
  try { inventory(); return "configured"; } catch { return "unreadable"; }
}
export function normalizeAccountAlias(value?: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return input(z.string().trim().min(1).max(64).refine((s) => ![...s].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127), "Use a printable account alias"), value);
}
export async function listToolkits(_cfg: AppConfig) {
  const cards = [...NATIVE, ...inventory().providers].map(({ slug, label, blurb, logo, domain }) => ({ slug, label, blurb, logo, domain }));
  return { cards, source: "api" as const, pagination: { items: cards.length, stalled: false } };
}
export async function toolkitCard(_cfg: AppConfig, slug: string): Promise<ToolkitCard> {
  const { label, blurb, domain, logo } = provider(slug);
  return { slug, label, blurb, domain, logo };
}
export function addProvider(raw: unknown): ToolkitCard {
  const parsed = input(providerInput, raw);
  const url = connectorUrl(parsed.url);
  if (url.search) throw new Error("Put access tokens in the Connect form, not the server address");
  const data = inventory();
  if (NATIVE.some((p) => p.slug === parsed.slug) || data.providers.some((p) => p.slug === parsed.slug)) throw new Error("That integration name already exists");
  if (data.providers.length >= 50) throw new Error("The workspace has reached its 50 integration limit");
  const card: Provider = { slug: parsed.slug, label: parsed.label, blurb: "Remote MCP server", domain: url.hostname, logo: null,
    remote: { url: url.href, auth: parsed.auth, ...(parsed.clientId ? { clientId: parsed.clientId } : {}) } };
  data.providers.push(card); save(data);
  return { slug: card.slug, label: card.label, blurb: card.blurb, domain: card.domain, logo: null };
}
export async function connectedServices(_cfg: AppConfig): Promise<Record<string, ConnectorServiceState>> {
  const services: Record<string, ConnectorServiceState> = {};
  for (const entry of inventory().accounts) {
    if (removing.has(entry.id)) continue;
    const state = services[entry.slug] ??= { connected: false, pending: false, status: "not_connected", accounts: [] };
    let status = entry.status;
    if (status === "PENDING" && ![...sessions.values()].some((s) => s.public.accountId === entry.id && !connectorAuthFinished(s.public) && s.public.expiresAt > Date.now())) status = "EXPIRED";
    state.accounts.push({ id: entry.id, alias: entry.alias, status });
    state.connected ||= status === "ACTIVE";
    state.pending ||= status === "PENDING";
    state.status = state.connected ? "ACTIVE" : state.pending ? "PENDING" : status;
  }
  return services;
}
export async function connectionStatus(cfg: AppConfig, slugs: string[]) {
  const services = await connectedServices(cfg);
  return Object.fromEntries(slugs.map((slug) => [slug, services[slug] ?? { connected: false, pending: false, status: "not_connected", accounts: [] }]));
}

async function gateway(id: string) {
  account(id);
  let pending = gateways.get(id);
  if (!pending) {
    pending = startConnectorGateway(directory(id)).catch((error) => { gateways.delete(id); throw error; });
    gateways.set(id, pending);
  }
  const value = await pending;
  account(id);
  return value;
}
async function configureChannel(session: AuthSession, fields: Record<string, string>) {
  const selected = provider(session.public.slug);
  const gw = await gateway(session.public.accountId);
  assertSession(session);
  let snapshot = await gw.request<{ hash: string; config?: { plugins?: { entries?: Record<string, unknown> } } }>("config.get", {});
  if (selected.channel !== "telegram" && !snapshot.config?.plugins?.entries?.[selected.channel!]) {
    assertSession(session);
    // Official installation establishes OpenClaw's trusted provenance. Loading
    // an unpacked npm directory cannot grant native plugins their state APIs.
    const installed = await gw.request<{ ok: boolean }>("plugins.install", {
      source: "npm", spec: `@openclaw/${selected.channel}@${OPENCLAW_VERSION}`,
      pin: true, expectedPluginId: selected.channel,
    });
    if (!installed.ok) throw new Error("OpenClaw could not install the channel plugin");
    assertSession(session);
    snapshot = await gw.request("config.get", {});
  }
  assertSession(session);
  await gw.request("config.patch", { baseHash: snapshot.hash, raw: JSON.stringify({
    plugins: { allow: ["openmausbot-connectors", selected.channel], entries: { [selected.channel!]: { enabled: true } } },
    channels: { [selected.channel!]: { enabled: true, ...fields, dmPolicy: "disabled", groupPolicy: "disabled", ...(selected.channel !== "whatsapp" ? { joinIntro: false } : {}) } },
  }) });
  // Plugin activation follows the Gateway config restart. A successful
  // config.patch is not proof that a newly loaded channel is ready for RPC.
  const until = Date.now() + 60_000;
  for (;;) {
    assertSession(session);
    const status = await gw.request<{ channelOrder?: string[] }>("channels.status", { probe: false });
    if (status.channelOrder?.includes(selected.slug)) break;
    if (Date.now() >= until) throw new Error("The channel plugin did not start");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assertSession(session);
  return gw;
}
async function verifyChannel(session: AuthSession, gw: ConnectorGateway) {
  const result = await gw.request<{ channelAccounts?: Record<string, Array<{ accountId?: string; configured?: boolean; connected?: boolean; linked?: boolean; probe?: { ok?: boolean } }>> }>("channels.status", { probe: true, timeoutMs: 10_000 });
  assertSession(session);
  const own = result.channelAccounts?.[session.public.slug]?.find((entry) => entry.accountId === "default");
  if (!own?.configured || !(own.probe?.ok === true || own.connected === true || own.linked === true)) throw new Error("The provider did not verify this account");
  finishSession(session);
}
async function remote(id: string) {
  account(id);
  const gw = await gateway(id);
  return {
    tools: async (): Promise<Tool[]> => (await gw.request<{ tools: Tool[] }>("omb.connectors.tools", {})).tools,
    call: async (name: string, args: Record<string, unknown>) => (await gw.request<{ result: unknown }>("omb.connectors.call", { name, arguments: args })).result,
  };
}
async function startRemote(session: AuthSession, token?: string, configure = true) {
  const spec = provider(session.public.slug).remote!;
  const gw = await gateway(session.public.accountId);
  assertSession(session);
  if (configure) {
    const snapshot = await gw.request<{ hash: string }>("config.get", {});
    assertSession(session);
    await gw.request("config.patch", { baseHash: snapshot.hash, raw: JSON.stringify({
      ...(spec.auth === "oauth" ? { gateway: { publicOrigin: new URL(session.redirectUrl).origin } } : {}),
      mcp: { servers: { connected_account: {
        enabled: true, url: spec.url, transport: "streamable-http",
        ...(spec.auth === "oauth" ? { auth: "oauth", oauth: { identity: "per-requester", ...(spec.clientId ? { clientId: spec.clientId } : {}) } } : {}),
        ...(spec.auth === "token" ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      } } },
    }) });
  }
  assertSession(session);
  if (spec.auth === "oauth") {
    const result = await gw.request<{ connected: boolean; authorizationUrl?: string }>("omb.connectors.authorize", {});
    assertSession(session);
    if (!result.connected) {
      const url = connectorUrl(result.authorizationUrl!);
      const nonce = url.searchParams.get("state");
      if (!nonce || url.searchParams.get("redirect_uri") !== session.redirectUrl) throw new Error("OpenClaw returned an invalid authorization binding");
      session.nonce = nonce;
      session.public = { ...session.public, kind: "browser", url: url.href, fields: undefined, manualCallback: new URL(session.redirectUrl).protocol === "http:" };
      return;
    }
  }
  await (await remote(session.public.accountId)).tools();
  finishSession(session);
}

export async function authorizeService(cfg: AppConfig, slug: string, requestedAlias?: unknown, callbackOrigin?: string): Promise<ConnectorAuthState> {
  if (!configured(cfg)) throw new Error("Connected Apps is disabled");
  const selected = provider(slug);
  const alias = normalizeAccountAlias(requestedAlias);
  const data = inventory();
  const existing = data.accounts.filter((a) => a.slug === slug && ["ACTIVE", "PENDING"].includes(a.status));
  // A second screen joins the exact in-flight login, allowing a phone to
  // request pairing and the owner's desktop to display that same QR code.
  const pending = [...sessions.values()].find((s) => s.public.slug === slug && s.public.alias === alias && !connectorAuthFinished(s.public) && s.public.expiresAt > Date.now());
  if (pending) return { ...pending.public };
  if (existing.length && !alias) throw new Error("Add an account alias so the existing connection is not replaced");
  if (data.accounts.length >= 500) throw new Error("Disconnect unused accounts before adding more connections");
  if (existing.length >= 5) throw new Error("This integration already has five accounts");
  if (alias && existing.some((a) => a.alias?.toLowerCase() === alias.toLowerCase())) throw new Error("That account alias is already in use");
  const id = randomUUID();
  const publicState: ConnectorAuthState = { id: randomUUID(), accountId: id, slug, alias, kind: "pending", expiresAt: Date.now() + TTL };
  const origin = callbackOrigin ? connectorUrl(callbackOrigin).origin : "";
  if (selected.remote?.auth === "oauth" && !origin) throw new Error("Configure this server's public HTTPS address before connecting OAuth accounts");
  const session: AuthSession = { public: publicState, nonce: randomUUID(), redirectUrl: `${origin}/oauth/mcp/callback` };
  data.accounts.push({ id, slug, alias, status: "PENDING" }); save(data); sessions.set(publicState.id, session);
  if (selected.fields || selected.remote?.auth === "token") {
    session.public = { ...publicState, kind: "form", fields: selected.fields ?? [{ key: "token", label: "Access token", secret: true }],
      ...(selected.channel ? { helpUrl: `https://docs.openclaw.ai/channels/${selected.channel}` } : {}) };
  } else if (selected.remote) {
    void runSession(session, () => startRemote(session));
  } else {
    void runSession(session, async () => {
      const gw = await configureChannel(session, {});
      const qr = await gw.request<{ qrDataUrl?: string; sessionKey?: string; connected?: boolean }>("web.login.start", { channel: slug, accountId: "default", timeoutMs: 20_000 });
      assertSession(session);
      if (qr.connected) return finishSession(session);
      if (!qr.qrDataUrl?.startsWith("data:image/png;base64,")) throw new Error("This provider did not return a QR code");
      session.qrSessionKey = qr.sessionKey;
      session.public = { ...session.public, kind: "qr", qrDataUrl: qr.qrDataUrl };
    });
  }
  return { ...session.public };
}
export async function authStatus(id: string): Promise<ConnectorAuthState> {
  const session = sessions.get(id);
  if (!session) throw Object.assign(new Error("This connection request expired. Start Connect again."), { status: 404 });
  if (!connectorAuthFinished(session.public) && Date.now() >= session.public.expiresAt) {
    await cancelAuth(id);
    return { ...session.public, error: "Connection request expired. Start Connect again." };
  }
  if (session.public.kind === "qr") void runSession(session, async () => {
    const gw = await gateway(session.public.accountId);
    const qr = await gw.request<{ connected?: boolean; qrDataUrl?: string; sessionKey?: string }>("web.login.wait", {
      channel: session.public.slug, accountId: "default", timeoutMs: 1_000,
      ...(session.qrSessionKey ? { sessionKey: session.qrSessionKey } : {}), currentQrDataUrl: session.public.qrDataUrl,
    });
    assertSession(session);
    if (qr.connected) finishSession(session);
    else if (qr.qrDataUrl?.startsWith("data:image/png;base64,")) session.public.qrDataUrl = qr.qrDataUrl;
    if (qr.sessionKey) session.qrSessionKey = qr.sessionKey;
  });
  return { ...session.public };
}
export async function submitAuth(id: string, raw: unknown): Promise<ConnectorAuthState> {
  const session = sessions.get(id);
  if (!session) throw new Error("Connection request expired");
  assertSession(session);
  if (session.busy) throw Object.assign(new Error("This connection is already being updated"), { status: 409 });
  if (session.public.kind === "browser") {
    const { callbackUrl } = input(z.object({ callbackUrl: z.string().max(8192) }).strict(), raw);
    const callback = new URL(callbackUrl);
    const expected = new URL(session.redirectUrl);
    if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.searchParams.get("state") !== session.nonce) throw new Error("That callback does not belong to this connection request");
    const code = callback.searchParams.get("code");
    if (!code) throw new Error("The provider did not return an authorization code");
    session.public.kind = "pending";
    void runSession(session, async () => {
      const gw = await gateway(session.public.accountId);
      assertSession(session);
      await gw.completeOAuth(callback.search);
      assertSession(session);
      await startRemote(session, undefined, false);
    });
  } else {
    if (session.public.kind !== "form") throw new Error("This connection is not waiting for credentials");
    const values = input(z.record(z.string(), z.string().trim().min(1).max(16_384)), raw);
    const fields = session.public.fields!;
    if (Object.keys(values).length !== fields.length || fields.some((field) => !values[field.key])) throw new Error("Complete the requested credential fields");
    session.public.kind = "pending";
    void runSession(session, async () => {
      if (provider(session.public.slug).remote) {
        await startRemote(session, values.token);
      } else {
        const gw = await configureChannel(session, values);
        await verifyChannel(session, gw);
      }
    });
  }
  return { ...session.public };
}
export async function oauthCallback(url: URL): Promise<void> {
  const nonce = url.searchParams.get("state");
  const session = [...sessions.values()].find((item) => item.nonce === nonce && item.public.kind === "browser");
  if (!session) throw new Error("This authorization request expired or was already used");
  if (url.searchParams.has("error")) { failSession(session); throw new Error("Authorization was not completed"); }
  // The HTTP listener need not share the public origin (TLS can terminate
  // at the reverse proxy). Only the configured redirect origin is used.
  await submitAuth(session.public.id, { callbackUrl: `${session.redirectUrl}${url.search}` });
}
export async function cancelAuth(id: string) {
  const session = sessions.get(id);
  if (!session || connectorAuthFinished(session.public)) return;
  session.public = { ...session.public, kind: "cancelled", url: undefined, qrDataUrl: undefined, fields: undefined };
  await removeAccount({}, session.public.slug, session.public.accountId);
}
async function stopAccount(id: string) {
  const g = gateways.get(id);
  const result = await Promise.allSettled([g?.then((value) => value.stop(), () => {})]);
  if (result.some((item) => item.status === "rejected")) throw new Error("Account shutdown could not be confirmed. Retry disconnecting.");
  if (gateways.get(id) === g) gateways.delete(id);
}
export async function removeAccount(_cfg: AppConfig, slug: string, id: string) {
  const data = inventory();
  if (!data.accounts.some((a) => a.id === id && a.slug === slug)) return { removed: 0 };
  removing.add(id);
  try {
    for (const session of sessions.values()) if (session.public.accountId === id && !connectorAuthFinished(session.public)) session.public = { ...session.public, kind: "cancelled", url: undefined, qrDataUrl: undefined, fields: undefined };
    await stopAccount(id);
    // Re-read after stopping to retain concurrent additions.
    const latest = inventory(); latest.accounts = latest.accounts.filter((a) => a.id !== id); save(latest);
    rmSync(directory(id), { recursive: true, force: true });
    return { removed: 1 };
  } finally { removing.delete(id); }
}
export async function removeService(cfg: AppConfig, slug: string) {
  let removed = 0;
  for (const entry of inventory().accounts.filter((a) => a.slug === slug)) removed += (await removeAccount(cfg, slug, entry.id)).removed;
  return { removed };
}
/** A process restart cannot continue an in-memory authorization attempt. */
export function recoverAbandonedConnections() {
  const data = inventory();
  let changed = false;
  for (const entry of data.accounts) if (entry.status === "PENDING" || entry.status === "FAILED") {
    rmSync(directory(entry.id), { recursive: true, force: true });
    entry.status = "FAILED"; changed = true;
  }
  if (changed) save(data);
}
export async function stopConnectors() { clearInterval(expiry); await Promise.allSettled([...gateways.keys()].map(stopAccount)); }

const objectSchema = { type: "object", properties: {}, additionalProperties: false };
const selection = { service: { type: "string" }, accountId: { type: "string" } };
const BRIDGE_TOOLS: Tool[] = [
  { name: "connectors_list_accounts", description: "List exact connected accounts approved for this bot. Connecting alone never grants access.", inputSchema: objectSchema },
  { name: "connectors_list_tools", description: "Get tool names, descriptions and input schemas for one approved account.", inputSchema: { type: "object", properties: selection, required: ["service", "accountId"], additionalProperties: false } },
  { name: "connectors_execute_tool", description: "Execute a discovered tool using one exact approved account. Writes may require approval. Never retry an uncertain result automatically.", inputSchema: { type: "object", properties: { ...selection, tool: { type: "string" }, arguments: { type: "object" } }, required: ["service", "accountId", "tool", "arguments"], additionalProperties: false } },
  { name: "connectors_request_connection", description: "Ask the user to connect a configured integration and grant account access. This creates a secure app card; never ask for credentials in chat.", inputSchema: { type: "object", properties: { toolkits: { type: "array", minItems: 1, maxItems: 5, items: { type: "object", properties: { toolkit: { type: "string" }, alias: { type: "string" } }, required: ["toolkit"], additionalProperties: false } } }, required: ["toolkits"], additionalProperties: false } },
];
const MESSAGE_TOOL: Tool = { name: "message_send", description: "Send a text message using this connected channel account. The target is a provider chat, channel or recipient ID.", inputSchema: { type: "object", properties: { target: { type: "string", minLength: 1 }, text: { type: "string", minLength: 1, maxLength: 16_000 } }, required: ["target", "text"], additionalProperties: false } };
function validateTool(tool: Tool, args: unknown) {
  const constructor = tool.inputSchema.$schema === "https://json-schema.org/draft/2020-12/schema" ? Ajv2020 : Ajv;
  const ajv = new constructor({ strict: false, allErrors: false, validateFormats: true });
  formats.default(ajv);
  if (!ajv.compile(tool.inputSchema)(args)) throw new Error(`Arguments do not match the schema for ${tool.name}`);
}
export async function mcpIntegration(cfg: AppConfig, context: { harnessUrl: string; commsToken: string; botId: string; threadId: string }): Promise<ConnectorMcpIntegration | null> {
  if (!configured(cfg)) return null;
  return { command: process.execPath, args: [SPAWNED_PROXIES.connectors], env: {
    ELECTRON_RUN_AS_NODE: "1", OMB_CONNECTOR_UPSTREAM_URL: `${context.harnessUrl}/api/internal/connectors/mcp`,
    OMB_CONNECTOR_UPSTREAM_HEADERS: JSON.stringify({ authorization: `Bearer ${context.commsToken}` }),
    OMB_HARNESS_URL: context.harnessUrl, OMB_CONNECTOR_TOKEN: context.commsToken, OMB_BOT_ID: context.botId, OMB_THREAD_ID: context.threadId,
  } };
}
export async function relayMcp(cfg: AppConfig, raw: unknown, _transportSessionId: string | undefined,
  context: { botId: string; accounts: ConnectorAccounts; stillAllowed(): boolean }) {
  const request = z.object({ id: z.union([z.number(), z.string()]).optional(), method: z.string(), params: z.record(z.string(), z.unknown()).optional() }).passthrough().parse(raw);
  const assertAllowed = () => { if (!configured(cfg) || !context.stillAllowed()) throw new Error("Connected-account access was revoked"); };
  let result: unknown;
  let error: unknown;
  try {
    assertAllowed();
    if (request.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "openmausbot-connectors", version: "2" } };
    else if (request.method === "tools/list") result = { tools: BRIDGE_TOOLS };
    else if (request.method === "tools/call") {
      const name = String(request.params?.name ?? "");
      const definition = BRIDGE_TOOLS.find((t) => t.name === name);
      if (!definition) throw new Error("Unknown connector tool");
      const args = request.params?.arguments ?? {};
      validateTool(definition, args);
      let value: unknown;
      if (name === "connectors_list_accounts") value = inventory().accounts.filter((a) => a.status === "ACTIVE" && context.accounts[a.slug]?.includes(a.id)).map(({ id, alias, slug }) => ({ service: slug, accountId: id, alias }));
      else {
        const input = args as { service: string; accountId: string; tool?: string; arguments?: Record<string, unknown> };
        const selected = account(input.accountId);
        const assertAccount = () => {
          assertAllowed();
          const live = account(selected.id);
          if (live.slug !== input.service || live.status !== "ACTIVE" || !context.accounts[input.service]?.includes(live.id)) throw new Error("This exact account is not approved for this bot");
        };
        assertAccount();
        const remoteSpec = provider(selected.slug).remote;
        const client = remoteSpec ? await remote(selected.id) : null;
        const tools = client ? await client.tools() : [MESSAGE_TOOL];
        assertAccount();
        if (name === "connectors_list_tools") value = tools;
        else if (name === "connectors_execute_tool") {
          const tool = tools.find((item) => item.name === input.tool);
          if (!tool) throw new Error("That tool is not available for this account");
          validateTool(tool, input.arguments);
          if (client) { assertAccount(); value = await client.call(tool.name, input.arguments!); }
          else {
            const gw = await gateway(selected.id);
            assertAccount();
            const response = await gw.request<{ ok: boolean; output?: unknown; error?: { message?: string } }>("tools.invoke", { name: "message", args: { action: "send", channel: selected.slug, accountId: "default", target: input.arguments!.target, message: input.arguments!.text } });
            if (!response.ok) throw new Error("OpenClaw refused the connector action. Check the account and its provider permissions.");
            value = response.output;
          }
        } else throw new Error("Connection requests must be handled by the app bridge");
      }
      const text = JSON.stringify(value);
      if (text.length > 1024 * 1024) throw new Error("The connector result exceeded its size limit");
      result = { content: [{ type: "text", text }], ...(value && typeof value === "object" && "isError" in value && value.isError === true ? { isError: true } : {}) };
    } else if (request.method.startsWith("notifications/")) result = {};
    else throw new Error("Unsupported connector method");
  } catch (caught) {
    // Tool errors remain MCP tool results so engines show their failure.
    const message = caught instanceof Error ? caught.message : "Connector request failed";
    if (request.method === "tools/call") result = { content: [{ type: "text", text: message }], isError: true };
    else error = { code: -32000, message };
  }
  return { status: 200, contentType: "application/json", transportSessionId: undefined,
    bytes: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: request.id ?? null, ...(error ? { error } : { result }) })) };
}

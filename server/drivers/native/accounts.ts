// Native account lifecycle, informed by Hermes's MIT-licensed auth modules.
// See docs/verification/native-agent.md. No Hermes process or credential store.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ProviderAuthenticationStart, ProviderAuthenticationStatus } from "../../contracts.ts";
import { writeFileAtomic } from "../../atomic.ts";
import { NATIVE_PROVIDERS, nativeAuthorizationLink, nativeProvider, type NativeProvider } from "../../../shared/native-providers.ts";

export interface NativeCredential { accessToken: string; refreshToken?: string; expiresAt?: number; baseUrl?: string; scope?: string }
export type NativeFetch = typeof fetch;
export interface AccountOptions { file: string; fetch?: NativeFetch; pollIntervalMs?: number; onChanged?: () => Promise<void> }
const clients: Record<string, string> = { "openai-codex": "app_EMoamEEZ73f0CkXaXp7hrann", "xai-oauth": "b1a00492-073a-47ea-816f-4c329264a828", nous: "hermes-cli" };
const refreshes = new Map<string, Promise<NativeCredential>>();
const reservations = new Set<string>();
const text = (value: unknown): string => typeof value === "string" ? value : "";
export function jwtClaims(token: string): Record<string, any> {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); } catch { return {}; }
}
export async function boundedJson(response: Response): Promise<any> {
  if (!response.body) throw new Error("Provider returned an empty response.");
  const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 1_048_576) throw new Error("Provider response exceeded the size limit.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { throw new Error("Provider returned an invalid or oversized response."); }
  finally { await reader.cancel().catch(() => {}); }
}
interface Flow {
  provider: string; status: ProviderAuthenticationStatus; abort: AbortController;
  verifier?: string; deviceCode?: string; tokenUrl?: string; interval: number; timer: NodeJS.Timeout;
  pending?: Promise<void>; reserved: boolean;
}

export class NativeAccounts {
  private flow: Flow | null = null;
  private disposed = false;
  private readonly lifetime = new AbortController();
  readonly fetch: NativeFetch;
  private readonly options: AccountOptions;
  constructor(options: AccountOptions) { this.options = options; this.fetch = options.fetch ?? fetch; }
  private read(): Record<string, NativeCredential> {
    try {
      const data = JSON.parse(readFileSync(this.options.file, "utf8"));
      if (data.version !== 1 || !data.accounts || typeof data.accounts !== "object" || Array.isArray(data.accounts)) throw new Error();
      for (const [id, credential] of Object.entries(data.accounts)) {
        nativeProvider(id);
        if (!credential || typeof credential !== "object" || Array.isArray(credential)) throw new Error();
        const saved = credential as NativeCredential;
        if (!text(saved.accessToken) || saved.accessToken.length > 65_536 || /[\r\n]/.test(saved.accessToken)) throw new Error();
        if (saved.refreshToken !== undefined && (!text(saved.refreshToken) || saved.refreshToken.length > 65_536)) throw new Error();
        if (saved.expiresAt !== undefined && (typeof saved.expiresAt !== "number" || !Number.isFinite(saved.expiresAt))) throw new Error();
        if (saved.baseUrl !== undefined && (id !== "nous" || !["https://inference-api.nousresearch.com/v1", "https://welcome-api.nousresearch.com/v1"].includes(saved.baseUrl))) throw new Error();
      }
      return data.accounts;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new Error("The native provider account file could not be read. Restore it before changing accounts.");
    }
  }
  private save(provider: string, credential?: NativeCredential): void {
    const accounts = this.read();
    if (credential) accounts[provider] = credential; else delete accounts[provider];
    mkdirSync(dirname(this.options.file), { recursive: true, mode: 0o700 });
    writeFileAtomic(this.options.file, JSON.stringify({ version: 1, accounts }), { mode: 0o600 });
  }
  connected(provider: string): boolean {
    const credential = this.read()[provider];
    return !!credential && (!credential.expiresAt || credential.expiresAt > Date.now() || !!credential.refreshToken);
  }
  describe() { return NATIVE_PROVIDERS.map(provider => ({ provider: provider.id, connected: this.connected(provider.id) })); }
  secrets(): string[] { return Object.values(this.read()).flatMap(c => [c.accessToken, c.refreshToken ?? ""]).filter(Boolean); }
  private key(provider: string) { return `${this.options.file}:${provider}`; }
  private async request(url: string, body?: Record<string, string>, signal?: AbortSignal, json = false, headers: Record<string, string> = {}) {
    const response = await this.fetch(url, {
      method: body ? "POST" : "GET", redirect: "error",
      headers: { accept: "application/json", ...(body ? { "content-type": json ? "application/json" : "application/x-www-form-urlencoded" } : {}), ...headers },
      ...(body ? { body: json ? JSON.stringify(body) : new URLSearchParams(body) } : {}),
      signal: AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : []), AbortSignal.timeout(20_000)]),
    });
    const payload = await boundedJson(response);
    return { response, payload };
  }
  private token(provider: string, payload: any, previous?: NativeCredential): NativeCredential {
    const accessToken = text(payload.access_token || payload.key);
    if (!accessToken) throw new Error("Provider did not return an access token.");
    const claims = jwtClaims(accessToken);
    const seconds = Number(payload.expires_in);
    const expiresAt = Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : typeof claims.exp === "number" ? claims.exp * 1000 : undefined;
    const credential: NativeCredential = { accessToken, refreshToken: text(payload.refresh_token) || previous?.refreshToken, expiresAt, scope: text(payload.scope) || previous?.scope };
    if (provider === "nous") {
      const scopes = [credential.scope, claims.scope, ...(Array.isArray(claims.scp) ? claims.scp : [claims.scp])].filter(v => typeof v === "string").join(" ").split(/\s+/);
      if (!scopes.includes("inference:invoke") || !expiresAt || expiresAt <= Date.now()) throw new Error("Nous did not grant a valid inference token. Check your subscription and reconnect.");
      const baseUrl = text(payload.inference_base_url) || previous?.baseUrl || nativeProvider(provider).baseUrl;
      if (!["https://inference-api.nousresearch.com/v1", "https://welcome-api.nousresearch.com/v1"].includes(baseUrl.replace(/\/+$/, ""))) throw new Error("Nous returned an untrusted inference endpoint.");
      credential.baseUrl = baseUrl.replace(/\/+$/, "");
    }
    return credential;
  }
  private async tokenEndpoint(provider: string, signal?: AbortSignal): Promise<string> {
    if (provider === "openai-codex") return "https://auth.openai.com/oauth/token";
    if (provider === "nous") return "https://portal.nousresearch.com/api/oauth/token";
    const { response, payload } = await this.request("https://auth.x.ai/.well-known/openid-configuration", undefined, signal);
    const url = new URL(text(payload.token_endpoint));
    if (!response.ok || url.origin !== "https://auth.x.ai" || url.username || url.password || url.hash || url.search) throw new Error("xAI returned an untrusted token endpoint.");
    return url.href;
  }
  async credential(provider: string, signal?: AbortSignal): Promise<NativeCredential> {
    nativeProvider(provider); signal?.throwIfAborted(); this.lifetime.signal.throwIfAborted();
    const current = this.read()[provider];
    if (!current) throw new Error(`Connect ${nativeProvider(provider).name} in Settings → Engines → OpenMaus Agent.`);
    if (!current.expiresAt || current.expiresAt > Date.now() + 120_000) return current;
    if (!current.refreshToken) throw new Error("This provider login expired. Reconnect it in Settings.");
    const key = this.key(provider);
    let pending = refreshes.get(key);
    if (!pending) {
      pending = (async () => {
        const endpoint = await this.tokenEndpoint(provider);
        const { response, payload } = await this.request(endpoint,
          { grant_type: "refresh_token", client_id: clients[provider], ...(provider === "nous" ? {} : { refresh_token: current.refreshToken! }) },
          undefined, false, provider === "nous" ? { "x-nous-refresh-token": current.refreshToken! } : {});
        if (!response.ok) throw new Error(`Provider token refresh failed (HTTP ${response.status}). Reconnect if the account was revoked.`);
        const updated = this.token(provider, payload, current);
        // A concurrent sign-out must never be undone by a late refresh.
        if (this.read()[provider]?.accessToken !== current.accessToken) throw new Error("The provider account changed. Retry the request.");
        this.lifetime.signal.throwIfAborted(); this.save(provider, updated); return updated;
      })().finally(() => refreshes.delete(key));
      refreshes.set(key, pending);
    }
    const credential = await pending; signal?.throwIfAborted(); return credential;
  }
  async start(provider = "openai-codex"): Promise<ProviderAuthenticationStart> {
    if (this.disposed) throw new Error("This engine was removed. Refresh Settings.");
    const spec = nativeProvider(provider);
    if (this.flow?.status.phase === "waiting") {
      if (this.flow.provider !== provider) throw new Error("Finish or cancel the current provider sign-in first.");
      return { ...this.flow.status, phase: "waiting" };
    }
    if (this.connected(provider)) return { phase: "succeeded", flowId: null, authorizationUrl: null, expiresAt: null };
    const key = this.key(provider);
    if (reservations.has(key)) throw new Error("This account already has a sign-in in progress.");
    reservations.add(key);
    const abort = new AbortController();
    const flow: Flow = {
      provider, abort, reserved: true, interval: 5000,
      status: { phase: "waiting", flowId: randomUUID(), authorizationUrl: null, expiresAt: new Date(Date.now() + 900_000).toISOString() },
      timer: setTimeout(() => this.finish("expired", "Sign-in expired. Request a new code."), 900_000),
    };
    flow.timer.unref(); this.flow = flow;
    try {
      if (spec.auth === "browser-code") {
        flow.verifier = randomBytes(32).toString("base64url");
        const url = new URL("https://openrouter.ai/auth");
        url.searchParams.set("code_challenge", createHash("sha256").update(flow.verifier).digest("base64url"));
        url.searchParams.set("code_challenge_method", "S256"); url.searchParams.set("key_label", "OpenMausBot");
        flow.status.authorizationUrl = url.href;
      } else if (spec.auth === "device-code") {
        flow.tokenUrl = await this.tokenEndpoint(provider, abort.signal);
        const url = provider === "openai-codex" ? "https://auth.openai.com/api/accounts/deviceauth/usercode"
          : provider === "nous" ? "https://portal.nousresearch.com/api/oauth/device/code" : "https://auth.x.ai/oauth2/device/code";
        const body = { client_id: clients[provider], ...(provider === "nous" ? { scope: "inference:invoke" } : provider === "xai-oauth" ? { scope: "openid profile email offline_access grok-cli:access api:access" } : {}) };
        const { response, payload } = await this.request(url, body, abort.signal, provider === "openai-codex");
        if (!response.ok) throw new Error(`Provider could not start sign-in (HTTP ${response.status}).`);
        const link = provider === "openai-codex" ? "https://auth.openai.com/codex/device" : text(payload.verification_uri_complete || payload.verification_uri);
        flow.deviceCode = text(payload.device_auth_id || payload.device_code);
        const userCode = text(payload.user_code);
        if (!flow.deviceCode || !/^[A-Za-z0-9 -]{3,64}$/.test(userCode) || !nativeAuthorizationLink(provider, link)) throw new Error("Provider returned an invalid device challenge.");
        const lifetime = Math.min(900, Math.max(1, Number(payload.expires_in) || 900)) * 1000;
        clearTimeout(flow.timer); flow.timer = setTimeout(() => this.finish("expired", "Sign-in expired. Request a new code."), lifetime); flow.timer.unref();
        flow.status = { ...flow.status, userCode, authorizationUrl: link, expiresAt: new Date(Date.now() + lifetime).toISOString() };
        flow.interval = this.options.pollIntervalMs ?? Math.min(60, Math.max(1, Number(payload.interval) || 5)) * 1000;
        flow.pending = this.poll(flow).catch(() => { if (!abort.signal.aborted) this.finish("failed", "Provider sign-in failed. Check your account and try again."); });
      }
      abort.signal.throwIfAborted();
      return { ...flow.status, phase: "waiting" };
    } catch (error) { this.finish("failed", "Could not start provider sign-in."); throw error; }
  }
  private async poll(flow: Flow): Promise<void> {
    for (;;) {
      await delay(flow.interval, undefined, { signal: flow.abort.signal });
      const isCodex = flow.provider === "openai-codex";
      const body: Record<string, string> = isCodex ? { device_auth_id: flow.deviceCode!, user_code: flow.status.userCode! }
        : { grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: clients[flow.provider], device_code: flow.deviceCode! };
      const { response, payload } = await this.request(isCodex ? "https://auth.openai.com/api/accounts/deviceauth/token" : flow.tokenUrl!, body, flow.abort.signal, isCodex);
      if (!response.ok) {
        if (isCodex && [403, 404].includes(response.status) || ["authorization_pending", "slow_down"].includes(payload.error)) {
          if (payload.error === "slow_down") flow.interval = Math.min(60_000, flow.interval + 5000);
          continue;
        }
        if (response.status >= 500 || response.status === 429) { flow.interval = Math.min(60_000, flow.interval + 5000); continue; }
        throw new Error("Provider denied sign-in.");
      }
      let tokens = payload;
      if (isCodex) {
        if (!text(payload.authorization_code) || !text(payload.code_verifier)) throw new Error("Provider returned an incomplete authorization grant.");
        const exchange = await this.request(flow.tokenUrl!, {
          grant_type: "authorization_code", client_id: clients[flow.provider], code: payload.authorization_code,
          code_verifier: payload.code_verifier, redirect_uri: "https://auth.openai.com/deviceauth/callback",
        }, flow.abort.signal);
        if (!exchange.response.ok) throw new Error("Provider could not exchange the authorization code.");
        tokens = exchange.payload;
      }
      flow.abort.signal.throwIfAborted();
      this.save(flow.provider, this.token(flow.provider, tokens)); this.finish("succeeded"); return;
    }
  }
  async complete(flowId: string, value: string): Promise<void> {
    const flow = this.flow;
    if (!flow || flow.status.flowId !== flowId || flow.status.phase !== "waiting") throw new Error("Start a new sign-in.");
    const spec = nativeProvider(flow.provider);
    const code = value.trim();
    if (!code || code.length > 16_384 || /[\r\n]/.test(code)) throw new Error("Enter a valid key or authorization code.");
    if (spec.auth === "device-code") throw new Error("Complete this sign-in at the provider's page.");
    let credential: NativeCredential;
    if (spec.auth === "browser-code") {
      const { response, payload } = await this.request("https://openrouter.ai/api/v1/auth/keys", { code, code_verifier: flow.verifier!, code_challenge_method: "S256" }, flow.abort.signal, true);
      if (!response.ok) throw new Error(`OpenRouter rejected the authorization code (HTTP ${response.status}).`);
      credential = this.token(flow.provider, payload);
    } else {
      const response = await this.fetch(`${spec.baseUrl}/models`, { headers: credentialHeaders(spec, { accessToken: code }), redirect: "error", signal: AbortSignal.any([flow.abort.signal, AbortSignal.timeout(15_000)]) });
      await response.body?.cancel();
      if (!response.ok && ![404, 405].includes(response.status)) throw new Error(`The provider could not validate this API key (HTTP ${response.status}).`);
      credential = { accessToken: code };
    }
    flow.abort.signal.throwIfAborted(); this.lifetime.signal.throwIfAborted();
    this.save(flow.provider, credential); this.finish("succeeded");
  }
  async get(flowId: string) {
    if (!flowId || this.flow?.status.flowId !== flowId) throw new Error("This sign-in is no longer available.");
    return { ...this.flow.status };
  }
  private finish(phase: ProviderAuthenticationStatus["phase"], message?: string) {
    const flow = this.flow; if (!flow || flow.status.phase !== "waiting") return;
    clearTimeout(flow.timer); flow.abort.abort();
    flow.status = { phase, flowId: flow.status.flowId, authorizationUrl: null, expiresAt: null, ...(message ? { message } : {}) };
    if (flow.reserved) { reservations.delete(this.key(flow.provider)); flow.reserved = false; }
    if (phase === "succeeded") void this.options.onChanged?.().catch(() => {});
  }
  async cancel() { this.finish("cancelled", "Sign-in cancelled."); await this.flow?.pending; }
  async signOut(provider = "openai-codex") {
    nativeProvider(provider);
    if (this.disposed) throw new Error("This engine was removed.");
    if (reservations.has(this.key(provider))) throw new Error("Finish or cancel this provider's sign-in first.");
    this.save(provider); await refreshes.get(this.key(provider))?.catch(() => {});
    await this.options.onChanged?.();
  }
  async dispose() { this.disposed = true; this.lifetime.abort(); await this.cancel(); }
}
export function credentialHeaders(provider: NativeProvider, credential: NativeCredential): Record<string, string> {
  if (provider.protocol === "messages") return { "x-api-key": credential.accessToken, "anthropic-version": "2023-06-01" };
  const headers: Record<string, string> = { authorization: `Bearer ${credential.accessToken}` };
  if (provider.id === "openai-codex") {
    const account = jwtClaims(credential.accessToken)["https://api.openai.com/auth"]?.chatgpt_account_id;
    if (typeof account === "string") headers["ChatGPT-Account-Id"] = account;
    headers.originator = "openmausbot";
  }
  return headers;
}

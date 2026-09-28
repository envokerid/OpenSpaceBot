import { createHash } from "node:crypto";
import { join } from "node:path";
import type { ModelCatalog, ProviderDriver } from "../contracts.ts";
import { DATA_DIR } from "../config.ts";
import { NATIVE_PROVIDERS, nativeProvider } from "../../shared/native-providers.ts";
import { createOpenAIChatRuntime } from "./openai-chat.ts";
import { boundedJson, credentialHeaders, NativeAccounts, type NativeFetch } from "./native/accounts.ts";
import { nativeCompletion } from "./native/transport.ts";

interface Config { models: Record<string, string[]>; chatgpt?: { effort?: "low" | "medium" | "high" | "xhigh"; fastMode?: boolean } }
function decodeConfig(raw: unknown): Config {
  const value = (raw ?? {}) as Record<string, unknown>;
  const models: Record<string, string[]> = {};
  if (value.models !== undefined) {
    if (!value.models || typeof value.models !== "object" || Array.isArray(value.models)) throw new Error("models must map providers to model IDs");
    for (const [id, ids] of Object.entries(value.models)) {
      nativeProvider(id);
      if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !id.trim() || id.length > 256)) throw new Error("Invalid provider models");
      models[id] = ids;
    }
  }
  const chatgpt = value.chatgpt as Config["chatgpt"];
  if (chatgpt !== undefined) {
    if (!chatgpt || typeof chatgpt !== "object" || Array.isArray(chatgpt)) throw new Error("chatgpt must be an object");
    if (chatgpt.effort !== undefined && !["low", "medium", "high", "xhigh"].includes(chatgpt.effort)) throw new Error("Invalid ChatGPT reasoning effort");
    if (chatgpt.fastMode !== undefined && typeof chatgpt.fastMode !== "boolean") throw new Error("ChatGPT fastMode must be a boolean");
  }
  return { models, ...(chatgpt ? { chatgpt: { effort: chatgpt.effort, fastMode: chatgpt.fastMode } } : {}) };
}
/** Test injection happens at the factory, never through a remotely editable URL. */
export function createNativeDriver(fetchProvider?: NativeFetch, pollIntervalMs?: number): ProviderDriver<Config> {
  return {
    driverKind: "nativeAgent", metadata: { displayName: "OpenMaus Agent", supportsMultipleInstances: true, access: "subscription" },
    models: { default: "", options: [] }, decodeConfig, defaultConfig: () => decodeConfig({}),
    async create(input) {
      const file = join(input.environment.OMB_DATA_DIR || DATA_DIR, "provider-accounts", `${createHash("sha256").update(input.instanceId).digest("hex")}.json`);
      let catalog: ModelCatalog = { default: "", options: [] };
      let refresh: Promise<void> | null = null;
      let disposed = false;
      const controller = new AbortController();
      const accounts = new NativeAccounts({ file, fetch: fetchProvider, pollIntervalMs, onChanged: () => refreshModels() });
      const refreshModels = async (): Promise<void> => {
        if (disposed) return;
        if (refresh) { await refresh; if (disposed) return; }
        const operation = (async () => {
          const lists = await Promise.all(NATIVE_PROVIDERS.map(async provider => {
            if (!accounts.connected(provider.id)) return [];
            const fallback = input.config.models[provider.id] ?? (provider.id === "minimax" ? ["MiniMax-M3", "MiniMax-M2.7"] : []);
            let ids: Array<{ id: string; label: string }> = fallback.map(id => ({ id, label: id }));
            try {
              const credential = await accounts.credential(provider.id, controller.signal);
              const response = await accounts.fetch(`${credential.baseUrl ?? provider.baseUrl}/models${provider.id === "openai-codex" ? "?client_version=0.116.0" : ""}`, {
                headers: credentialHeaders(provider, credential), redirect: "error", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
              });
              if (response.ok) {
                const payload = await boundedJson(response);
                const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
                const discovered = rows.flatMap((row: any) => {
                  const id = row.id || row.slug; return typeof id === "string" && id.length <= 256
                    ? [{ id, label: typeof (row.name || row.display_name) === "string" ? row.name || row.display_name : id }] : [];
                });
                ids = [...discovered, ...ids];
              } else await response.body?.cancel();
            } catch { /* A saved account remains usable with its last known catalog. */ }
            if (!ids.length) return catalog.options.filter(row => row.provider === provider.id);
            return ids.map(row => ({ id: `${provider.id}:${row.id}`, label: row.label, provider: provider.id }));
          }));
          if (disposed) return;
          const seen = new Set<string>();
          const options = lists.flat().filter(row => accounts.connected(row.provider!) && !seen.has(row.id) && !!seen.add(row.id));
          catalog = { default: options.some(row => row.id === catalog.default) ? catalog.default : options[0]?.id ?? "", options };
        })();
        refresh = operation;
        try { await operation; } finally { if (refresh === operation) refresh = null; }
      };
      const runtime = createOpenAIChatRuntime({
        input, driverKind: "nativeAgent", apiKey: "managed-account", apiUrl: "",
        models: () => catalog, refreshModels, credentialSecrets: () => accounts.secrets(),
        fetchCompletion: (body, signal) => nativeCompletion(accounts, body, signal),
        requestBody: (model, messages, stream) => ({ model, messages, stream,
          ...(model.startsWith("openai-codex:") ? {
            ...(input.config.chatgpt?.effort ? { reasoning: { effort: input.config.chatgpt.effort } } : {}),
            ...(input.config.chatgpt?.fastMode !== undefined ? { service_tier: input.config.chatgpt.fastMode ? "priority" : "default" } : {}),
          } : {}),
          ...(stream ? { stream_options: { include_usage: true } } : {}),
        }),
        httpErrorLabel: "provider", missingKeyError: "Connect a provider in Settings.", unavailableReason: "Connect a provider in Settings.",
        timeoutMs: 180_000, reasoning: true, includeUsageInCompleted: true, retryScale: 1,
        nativeLog: { source: "openmaus.native", outgoing: (_turn, messages, model) => ({ model, messageCount: messages.length }), incoming: completion => ({ textLength: completion.text.length, usage: completion.usage }) },
      });
      const activeProviders = new Map<string, string>();
      let changingAccount = false;
      runtime.adapter.onEvent(event => {
        if (event.type === "session.started" && event.model) activeProviders.set(event.threadId, event.model.split(":")[0]);
        if (event.type === "turn.completed") activeProviders.delete(event.threadId);
      });
      const sendTurn = runtime.adapter.sendTurn;
      runtime.adapter.sendTurn = async turn => {
        if (changingAccount) throw new Error("The provider account is being updated. Try again shortly.");
        return sendTurn(turn);
      };
      await refreshModels();
      return {
        ...runtime,
        get models() { return catalog; },
        get nativeAccounts() { return accounts.describe(); },
        snapshot: async () => ({ state: "available" as const, authenticated: accounts.describe().some(row => row.connected), version: "built-in" }),
        startAuthentication: provider => accounts.start(provider), getAuthentication: id => accounts.get(id),
        completeAuthentication: (id, code) => accounts.complete(id, code), cancelAuthentication: () => accounts.cancel(),
        signOut: async (provider = "openai-codex") => {
          if ([...activeProviders.values()].includes(provider)) throw new Error("Finish or stop tasks using this provider before disconnecting it.");
          changingAccount = true;
          try { await accounts.signOut(provider); } finally { changingAccount = false; }
        },
        dispose: async () => { disposed = true; controller.abort(); await accounts.dispose(); await runtime.dispose(); },
      };
    },
  };
}
export const NativeAgentDriver = createNativeDriver();

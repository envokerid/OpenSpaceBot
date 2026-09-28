// Provider account choices for OpenMausBot's own agent loop. No runtime CLI.
export type NativeAuthMethod = "device-code" | "browser-code" | "api-key";
export interface NativeProvider {
  id: string;
  name: string;
  auth: NativeAuthMethod;
  protocol: "chat" | "responses" | "messages";
  baseUrl: string;
  authOrigin?: string;
}
export const NATIVE_PROVIDERS: readonly NativeProvider[] = [
  { id: "openai-codex", name: "ChatGPT", auth: "device-code", protocol: "responses", baseUrl: "https://chatgpt.com/backend-api/codex", authOrigin: "https://auth.openai.com" },
  { id: "xai-oauth", name: "Grok subscription", auth: "device-code", protocol: "responses", baseUrl: "https://api.x.ai/v1", authOrigin: "https://auth.x.ai" },
  { id: "nous", name: "Nous Portal", auth: "device-code", protocol: "chat", baseUrl: "https://inference-api.nousresearch.com/v1", authOrigin: "https://portal.nousresearch.com" },
  { id: "openrouter", name: "OpenRouter", auth: "browser-code", protocol: "chat", baseUrl: "https://openrouter.ai/api/v1", authOrigin: "https://openrouter.ai" },
  { id: "openai-api", name: "OpenAI API", auth: "api-key", protocol: "chat", baseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic API", auth: "api-key", protocol: "messages", baseUrl: "https://api.anthropic.com/v1" },
  { id: "gemini", name: "Google AI Studio", auth: "api-key", protocol: "chat", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "xai", name: "xAI API", auth: "api-key", protocol: "chat", baseUrl: "https://api.x.ai/v1" },
  { id: "deepseek", name: "DeepSeek", auth: "api-key", protocol: "chat", baseUrl: "https://api.deepseek.com/v1" },
  { id: "minimax", name: "MiniMax API", auth: "api-key", protocol: "messages", baseUrl: "https://api.minimax.io/anthropic/v1" },
  { id: "zai", name: "Z.AI", auth: "api-key", protocol: "chat", baseUrl: "https://api.z.ai/api/paas/v4" },
  { id: "alibaba", name: "Qwen Cloud", auth: "api-key", protocol: "chat", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
  { id: "groq", name: "Groq", auth: "api-key", protocol: "chat", baseUrl: "https://api.groq.com/openai/v1" },
];
export function nativeProvider(id: string): NativeProvider {
  const provider = NATIVE_PROVIDERS.find(row => row.id === id);
  if (!provider) throw new Error("Choose a supported provider.");
  return provider;
}
export function nativeAuthorizationLink(provider: string, value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === nativeProvider(provider).authOrigin && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export interface NativeAccountInfo { provider: string; connected: boolean }

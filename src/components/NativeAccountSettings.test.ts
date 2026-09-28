import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NativeAccountSettings } from "./NativeAccountSettings";
import { nativeAuthorizationLink, NATIVE_PROVIDERS } from "../../shared/native-providers";
vi.mock("@/state/store", async original => ({ ...await original<typeof import("@/state/store")>(), useStore: () => ({ refreshInstances: async () => {}, refreshModels: async () => {} }) }));
describe("native provider settings", () => {
  it("offers multiple provider methods without installing a runner", () => {
    const html = renderToStaticMarkup(createElement(NativeAccountSettings, { instance: { instanceId: "native", driverKind: "nativeAgent", displayName: "OpenMaus Agent", snapshot: { state: "available", authenticated: false }, models: { default: "", options: [] }, nativeAccounts: NATIVE_PROVIDERS.map(provider => ({ provider: provider.id, connected: false })) } }));
    expect(html).toContain("Connect ChatGPT"); expect(html).toContain("OpenRouter"); expect(html).toContain("Anthropic API");
    expect(html).not.toContain("hermes"); expect(html).not.toContain("npm install");
  });
  it("pins authorization links to their provider origin", () => {
    expect(nativeAuthorizationLink("openrouter", "https://openrouter.ai/auth?code_challenge=public")).toBeTruthy();
    for (const url of ["https://evil.example/auth", "javascript:alert(1)", "https://user:secret@openrouter.ai/auth", "https://openrouter.ai.evil.example/auth"]) expect(nativeAuthorizationLink("openrouter", url)).toBeNull();
    expect(nativeAuthorizationLink("openai-codex", "https://openrouter.ai/auth")).toBeNull();
  });
});

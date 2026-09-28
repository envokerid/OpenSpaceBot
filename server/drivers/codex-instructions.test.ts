import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { codexDeveloperInstructions, syncCodexInstructions, syncCodexTurnContext } from "./codex-instructions.ts";

describe("Codex effective developer instructions", () => {
  it("preserves native rules after bot rules, including when bot rules are removed", () => {
    const config = { developer_instructions: "Native rules." };
    expect(codexDeveloperInstructions(config, "Bot rules.")).toBe("Bot rules.\n\nNative rules.");
    expect(codexDeveloperInstructions(config, "")).toBe("No OpenMausBot bot-specific instructions remain.\n\nNative rules.");
    expect(codexDeveloperInstructions({}, "Bot rules.")).toBe("Bot rules.");
    expect(codexDeveloperInstructions({ developer_instructions: null }, "")).toBe("");
  });

  it.each([undefined, null, [], { developer_instructions: 42 }])("rejects unknown native configuration: %j", (config) => {
    expect(() => codexDeveloperInstructions(config, "Bot rules.")).toThrow("cannot safely update bot instructions");
  });
});

describe("Codex instruction receipts", () => {
  it("records acknowledged initial context without a separate injection", async () => {
    const key = randomUUID();
    const request = vi.fn().mockResolvedValue({});
    await syncCodexTurnContext(key, "native", "initial context", request, true);
    await syncCodexTurnContext(key, "native", "initial context", request);
    expect(request).not.toHaveBeenCalled();
    await syncCodexTurnContext(key, "native", "changed context", request);
    expect(request).toHaveBeenCalledTimes(1);
    await syncCodexTurnContext(key, "native", "changed context", request, false, true);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("updates and clears task context without duplicating standing rules", async () => {
    const key = randomUUID();
    const request = vi.fn().mockResolvedValue({});
    await syncCodexTurnContext(key, "native", "first memory", request);
    await syncCodexTurnContext(key, "native", "first memory", request);
    expect(request).toHaveBeenCalledTimes(1);
    await syncCodexTurnContext(key, "native", "new memory", request);
    expect(request.mock.calls[1][1].items[0].content[0].text).toContain("new memory");
    expect(request.mock.calls[1][1].items[0].content[0].text).not.toContain("first memory");
    await syncCodexTurnContext(key, "native", "", request);
    expect(request.mock.calls[2][1].items[0].content[0].text).toContain("No additional task context remains.");
    await syncCodexTurnContext(key, "native", "", request);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("does not persist a failed task-context injection", async () => {
    const key = randomUUID();
    const request = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({});
    await expect(syncCodexTurnContext(key, "native", "memory", request)).rejects.toThrow("unavailable");
    await syncCodexTurnContext(key, "native", "memory", request);
    await syncCodexTurnContext(key, "native", "memory", request);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not repeat unchanged rules, but persists edits and removal", async () => {
    const key = randomUUID();
    const request = vi.fn().mockResolvedValue({});
    await syncCodexInstructions(key, "native", "old", false, request);
    await syncCodexInstructions(key, "native", "old", true, request);
    expect(request).not.toHaveBeenCalled();
    await syncCodexInstructions(key, "native", "new", true, request);
    await syncCodexInstructions(key, "native", "new", true, request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].items[0]).toMatchObject({ role: "developer" });
    expect(request.mock.calls[0][1].items[0].content[0].text).toContain("new");
    await syncCodexInstructions(key, "native", "", true, request);
    await syncCodexInstructions(key, "native", "", true, request);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].items[0].content[0].text).toContain("No OpenMausBot bot-specific instructions remain.");
  });

  it("adopts an existing native session once without replaying user history", async () => {
    const key = randomUUID();
    const request = vi.fn().mockResolvedValue({});
    await syncCodexInstructions(key, "pre-fix", "current rules", true, request);
    await syncCodexInstructions(key, "pre-fix", "current rules", true, request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("thread/inject_items");
    expect(request.mock.calls[0][1].threadId).toBe("pre-fix");
    expect(request.mock.calls[0][1].items).toHaveLength(1);
  });

  it("does not acknowledge an update that Codex rejected", async () => {
    const key = randomUUID();
    const rejected = vi.fn().mockRejectedValue(new Error("method not found"));
    await expect(syncCodexInstructions(key, "native", "rules", true, rejected)).rejects.toThrow("method not found");
    const accepted = vi.fn().mockResolvedValue({});
    await syncCodexInstructions(key, "native", "rules", true, accepted);
    await syncCodexInstructions(key, "native", "rules", true, accepted);
    expect(accepted).toHaveBeenCalledTimes(1);
  });

  it("keeps native sessions independent within one provider instance", async () => {
    const key = randomUUID();
    const request = vi.fn().mockResolvedValue({});
    await syncCodexInstructions(key, "first", "rules", false, request);
    await syncCodexInstructions(key, "second", "rules", true, request);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

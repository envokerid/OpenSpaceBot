import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPROVED_MCP_TOOL,
  effectiveMcpToolApprovals,
  mcpApprovalKey,
  mcpToolApproved,
} from "./approved-commands.ts";

describe("approved MCP commands", () => {
  it("approves Composio multi-execute for every bot unless explicitly revoked", () => {
    for (const name of [
      DEFAULT_APPROVED_MCP_TOOL,
      "mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL",
      "composio__COMPOSIO_MULTI_EXECUTE_TOOL",
      "composio_composio_multi_execute_tool",
    ]) {
      expect(mcpToolApproved(undefined, name)).toBe(true);
      expect(mcpToolApproved({ [DEFAULT_APPROVED_MCP_TOOL]: false }, name)).toBe(false);
      expect(mcpToolApproved({ [DEFAULT_APPROVED_MCP_TOOL]: true }, name)).toBe(true);
    }
  });

  it("keeps other observed MCP tools off until that bot is approved", () => {
    expect(mcpToolApproved(undefined, "mcp__notes__search")).toBe(false);
    expect(mcpToolApproved({ "mcp__notes__search": true }, "mcp__notes__search")).toBe(true);
    expect(mcpToolApproved({ "mcp__notes__search": false }, "mcp__notes__search")).toBe(false);
  });

  it("shows the built-in default explicitly while preserving a bot override", () => {
    expect(effectiveMcpToolApprovals(undefined)).toEqual({
      [DEFAULT_APPROVED_MCP_TOOL]: true,
    });
    expect(effectiveMcpToolApprovals({ [DEFAULT_APPROVED_MCP_TOOL]: false })).toEqual({
      [DEFAULT_APPROVED_MCP_TOOL]: false,
    });
  });

  it("normalizes the default aliases and refuses unsafe stored labels", () => {
    expect(mcpApprovalKey(" MCP__COMPOSIO__COMPOSIO_MULTI_EXECUTE_TOOL ")).toBe(DEFAULT_APPROVED_MCP_TOOL);
    expect(mcpApprovalKey("notes_search")).toBe("notes_search");
    expect(mcpApprovalKey("notes\nsearch")).toBeNull();
    expect(mcpApprovalKey("x".repeat(241))).toBeNull();
  });

  it("inherits saved defaults while keeping explicit bot revocations", () => {
    const defaults = { "mcp__notes__write": true, [DEFAULT_APPROVED_MCP_TOOL]: false };
    expect(mcpToolApproved(undefined, "mcp__notes__write", defaults)).toBe(true);
    expect(mcpToolApproved({ "mcp__notes__write": false }, "mcp__notes__write", defaults)).toBe(false);
    expect(mcpToolApproved(undefined, DEFAULT_APPROVED_MCP_TOOL, defaults)).toBe(false);
    expect(effectiveMcpToolApprovals(undefined, defaults)).toEqual(defaults);
  });
});

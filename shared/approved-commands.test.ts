import { describe, expect, it } from "vitest";

import {
  CONNECTOR_EXECUTE_TOOL,
  effectiveMcpToolApprovals,
  mcpApprovalKey,
  mcpToolApproved,
} from "./approved-commands.ts";

describe("approved MCP commands", () => {
  it("requires explicit approval for connector execution", () => {
    for (const name of [
      CONNECTOR_EXECUTE_TOOL,
      "mcp__connectors__CONNECTORS_EXECUTE_TOOL",
      "connectors__CONNECTORS_EXECUTE_TOOL",
      "connectors_connectors_execute_tool",
      "mcp__openmausbot_connectors__connectors_execute_tool",
    ]) {
      expect(mcpToolApproved(undefined, name)).toBe(false);
      expect(mcpToolApproved({ [CONNECTOR_EXECUTE_TOOL]: false }, name)).toBe(false);
      expect(mcpToolApproved({ [CONNECTOR_EXECUTE_TOOL]: true }, name)).toBe(true);
    }
  });

  it("keeps other observed MCP tools off until that bot is approved", () => {
    expect(mcpToolApproved(undefined, "mcp__notes__search")).toBe(false);
    expect(mcpToolApproved({ "mcp__notes__search": true }, "mcp__notes__search")).toBe(true);
    expect(mcpToolApproved({ "mcp__notes__search": false }, "mcp__notes__search")).toBe(false);
  });

  it("has no implicit tool approval and preserves an explicit bot override", () => {
    expect(effectiveMcpToolApprovals(undefined)).toEqual({});
    expect(effectiveMcpToolApprovals({ [CONNECTOR_EXECUTE_TOOL]: false })).toEqual({
      [CONNECTOR_EXECUTE_TOOL]: false,
    });
  });

  it("normalizes the default aliases and refuses unsafe stored labels", () => {
    expect(mcpApprovalKey(" MCP__CONNECTORS__CONNECTORS_EXECUTE_TOOL ")).toBe(CONNECTOR_EXECUTE_TOOL);
    expect(mcpApprovalKey("notes_search")).toBe("notes_search");
    expect(mcpApprovalKey("notes\nsearch")).toBeNull();
    expect(mcpApprovalKey("x".repeat(241))).toBeNull();
  });

  it("inherits saved defaults while keeping explicit bot revocations", () => {
    const defaults = { "mcp__notes__write": true, [CONNECTOR_EXECUTE_TOOL]: false };
    expect(mcpToolApproved(undefined, "mcp__notes__write", defaults)).toBe(true);
    expect(mcpToolApproved({ "mcp__notes__write": false }, "mcp__notes__write", defaults)).toBe(false);
    expect(mcpToolApproved(undefined, CONNECTOR_EXECUTE_TOOL, defaults)).toBe(false);
    expect(effectiveMcpToolApprovals(undefined, defaults)).toEqual(defaults);
  });
});

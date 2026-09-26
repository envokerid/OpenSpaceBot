/** Standing MCP approvals are bot-wide and independent of conversation modes. */
export const DEFAULT_APPROVED_MCP_TOOL = "composio_multi_execute_tool";

export function mcpApprovalKey(tool: string): string | null {
  const value = tool.trim();
  const lower = value.toLowerCase();
  if (lower === DEFAULT_APPROVED_MCP_TOOL ||
      lower === `mcp__composio__${DEFAULT_APPROVED_MCP_TOOL}` ||
      lower === `composio__${DEFAULT_APPROVED_MCP_TOOL}` ||
      lower === `composio_${DEFAULT_APPROVED_MCP_TOOL}`) return DEFAULT_APPROVED_MCP_TOOL;
  if (!value || value.length > 240) return null;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return null;
  }
  return value;
}

export function mcpToolApproved(approvals: Record<string, boolean> | undefined, tool: string, defaults?: Record<string, boolean>): boolean {
  const key = mcpApprovalKey(tool);
  if (!key) return false;
  return approvals && Object.hasOwn(approvals, key) ? approvals[key] === true
    : defaults && Object.hasOwn(defaults, key) ? defaults[key] === true : key === DEFAULT_APPROVED_MCP_TOOL;
}

/** The settings API returns effective values so built-in defaults are visible
 * in the same list as per-bot overrides. */
export function effectiveMcpToolApprovals(
  approvals: Record<string, boolean> | undefined,
  defaults?: Record<string, boolean>,
): Record<string, boolean> {
  return { [DEFAULT_APPROVED_MCP_TOOL]: true, ...defaults, ...approvals };
}

export interface ApprovedCommandsResponse {
  tools: string[];
  newBotApprovals?: Record<string, boolean>;
  bots: Array<{ id: string; name: string; approvals: Record<string, boolean> }>;
}

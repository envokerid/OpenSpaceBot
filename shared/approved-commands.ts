/** Standing MCP approvals are bot-wide and independent of conversation modes. */
export const CONNECTOR_EXECUTE_TOOL = "connectors_execute_tool";

export function mcpApprovalKey(tool: string): string | null {
  const value = tool.trim();
  const lower = value.toLowerCase();
  if (lower === CONNECTOR_EXECUTE_TOOL ||
      lower === `mcp__connectors__${CONNECTOR_EXECUTE_TOOL}` ||
      lower === `connectors__${CONNECTOR_EXECUTE_TOOL}` ||
      lower === `connectors_${CONNECTOR_EXECUTE_TOOL}` ||
      lower === `mcp__openmausbot_connectors__${CONNECTOR_EXECUTE_TOOL}` ||
      lower === `openmausbot_connectors_${CONNECTOR_EXECUTE_TOOL}`) return CONNECTOR_EXECUTE_TOOL;
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
    : defaults && Object.hasOwn(defaults, key) ? defaults[key] === true : false;
}

/** The settings API returns effective values so built-in defaults are visible
 * in the same list as per-bot overrides. */
export function effectiveMcpToolApprovals(
  approvals: Record<string, boolean> | undefined,
  defaults?: Record<string, boolean>,
): Record<string, boolean> {
  return { ...defaults, ...approvals };
}

export interface ApprovedCommandsResponse {
  tools: string[];
  newBotApprovals?: Record<string, boolean>;
  bots: Array<{ id: string; name: string; approvals: Record<string, boolean> }>;
}

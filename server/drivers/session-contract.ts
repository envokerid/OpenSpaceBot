/** Credential files are refreshed by the harness before each turn. Only
 * these explicitly supported refresh channels may ignore a launch token
 * when comparing contracts; all other credentials still force a restart. */
export function sessionContract(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sessionContract);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const tokens = ["OMB_COMMS_TOKEN", "OMB_BROWSER_TOKEN", "OMB_CONNECTOR_TOKEN", "OMB_CONTROL_TOKEN"];
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [
    key, (tokens.includes(key) && typeof record[`${key}_FILE`] === "string") ||
      (key === "OMB_CONNECTOR_UPSTREAM_HEADERS" && typeof record.OMB_CONNECTOR_TOKEN_FILE === "string")
      ? "[turn credential file]" : sessionContract(entry),
  ]));
}

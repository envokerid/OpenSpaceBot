/** Explicit account approvals. Missing/empty means no connected-account access. */
export type ConnectorAccounts = Record<string, string[]>;

export function connectorAccountKey(accounts: ConnectorAccounts = {}): string {
  return JSON.stringify(Object.entries(accounts).filter(([, ids]) => ids.length)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, ids]) => [slug, [...new Set(ids)].sort()]));
}

/** Use both an allowlist and exact account pins: omitted toolkit pins otherwise
 * fall back to the user's other active accounts in Tool Router. */
export function connectorSessionPolicy(accounts: ConnectorAccounts) {
  const entries = JSON.parse(connectorAccountKey(accounts)) as Array<[string, string[]]>;
  if (!entries.length) throw new Error("No connector accounts approved for this bot. Add an account in the bot's Access sidebar.");
  return {
    toolkits: { enable: entries.map(([slug]) => slug) },
    connected_accounts: Object.fromEntries(entries),
    manage_connections: { enable: false, enable_wait_for_connections: false, enable_connection_removal: false },
    // Do not retain executable code or files across approval changes.
    workbench: { enable: false },
    multi_account: { enable: true, max_accounts_per_toolkit: 5, require_explicit_selection: true },
  };
}

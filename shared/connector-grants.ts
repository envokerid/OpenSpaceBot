/** Explicit account approvals. Missing/empty means no connected-account access. */
export type ConnectorAccounts = Record<string, string[]>;

export function connectorAccountKey(accounts: ConnectorAccounts = {}): string {
  return JSON.stringify(Object.entries(accounts).filter(([, ids]) => ids.length)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, ids]) => [slug, [...new Set(ids)].sort()]));
}

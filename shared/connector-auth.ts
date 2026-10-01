/** Public account-authentication state. No provider or Gateway credentials. */
export interface ConnectorAuthState {
  id: string;
  accountId: string;
  slug: string;
  alias?: string;
  kind: "pending" | "form" | "browser" | "qr" | "connected" | "failed" | "cancelled";
  expiresAt: number;
  url?: string;
  qrDataUrl?: string;
  fields?: Array<{ key: string; label: string; secret: boolean }>;
  helpUrl?: string;
  manualCallback?: boolean;
  error?: string;
}

export function connectorAuthFinished(state: ConnectorAuthState): boolean {
  return ["connected", "failed", "cancelled"].includes(state.kind);
}

/** A first VM action can acquire and prepare its desktop inside the control
 * request. The proxy deadline must outlast that server-side grace period. */
export const COMPUTER_CONTROL_SETUP_GRACE_MS = 5_000;
export const COMPUTER_CONTROL_REQUEST_TIMEOUT_MS = COMPUTER_CONTROL_SETUP_GRACE_MS + 3_000;

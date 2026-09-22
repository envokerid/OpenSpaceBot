# Connector account approvals

Run the real renderer against two synthetic Gmail accounts (`work` and
`personal`), an isolated workspace and the fake engine:

```sh
node --experimental-strip-types scripts/verify-connector-accounts.ts
```

The launcher prints the `ui`, `url`, temporary data directory, and persistent
server log path. Use that exact `ui` handle with `control-omb ui`; never point
these checks at the user's app. Ctrl-C stops the browser, preview, fixture
server and account stub and removes the temporary workspace.

1. Open Pepper's profile → Access → **Approved accounts +**. Choose
   `gmail · work`. The sidebar must show only work. `GET /api/bots` must
   show `connectorAccounts: { gmail: ["ca_work"] }` for Pepper only.
2. Choose **Connect an app…** to open Plugins. Work must list Pepper under
   Approved bots. Choose **personal +** → Pepper. Pepper must now have both
   accounts; the other bot must still have no approvals.
3. Remove Pepper from work. Reopen Pepper's Access sidebar; personal alone
   must remain. Remove personal there. Both views must now show no approvals.
4. Add work again and inspect the fixture's `bots.json`: the same exact
   account ID must be persisted. A failed approval request must show an error,
   leave approvals unchanged and offer retry.
5. Inspect both views and the browser console. Plus and remove controls must
   have accessible names, account names must stay distinct, and no browser
   console errors should occur.

Automated renderer/API/persistence regression:

```sh
OMB_UI_E2E=1 pnpm exec vitest run scripts/testing/connector-accounts-ui.e2e.test.ts
pnpm exec vitest run server/index.test.ts -t 'assigns individual connector|second-account cards|slow connector request'
pnpm exec vitest run server/composio.test.ts server/connector-proxy.test.ts src/components/PluginsPanel.test.ts
pnpm broker:test
```

The UI regression saves its fixture identity, final API state, snapshot, and
console results under `.omb-scratch/verify-evidence/connector-accounts/`.
On a host where Chrome's sandbox cannot start, an explicitly supplied
`AGENT_BROWSER_EXECUTABLE_PATH` wrapper may add `--no-sandbox` for this
throwaway headless browser only.

Server tests cover missing/pending/wrong-service accounts, idempotent and
concurrent grants, denied self-approval with bot credentials, revocation of a
request waiting for its body, disconnection cleanup across bots, and
account-specific connector card completion.
Connector transport tests cover per-bot session separation, replacing a session
when approvals change, and refusing a request revoked during session setup.
Broker tests assert the same toolkit allowlist and exact account pins.

## Access behavior

`connectorAccounts` on each bot maps service slugs to approved account IDs.
Absent or empty means no account access, including for existing bots. The
Connected apps switch remains a master disable. Adding an approval enables
it. Connecting an account, polling an OAuth card, or importing a bot does not
approve account access by itself.

The gateway uses restricted Tool Router sessions with `toolkits.enable` and
`connected_accounts` pins, with connection management and remote workbench
disabled. This follows the provider's [session API contract](https://docs.composio.dev/reference/api-reference/tool-router/postToolRouterSession).
Account aliases are display names; authorization always uses stable IDs.
Managed installations require the matching broker update (`/v1/mcp/scoped`);
an older broker fails closed rather than using its unrestricted endpoint.

## Exercised 2026-09-21

The isolated real renderer completed steps 1–5 with two accounts and two bots.
The automated regression also passed failed-save recovery and persistence;
its server log is `/tmp/openmausbot-verification-evidence/server-1789997443144-41706.log`.
Screenshots of both views were inspected; the console had no errors. Evidence
is in `.omb-scratch/verify-evidence/connector-accounts/`, with manual fixture
server log `/tmp/openmausbot-verification-evidence/server-1789996863940-15513.log`.
These checks use synthetic inventory and mocked provider transport. They do
not prove live OAuth or provider-side execution of real account calls.

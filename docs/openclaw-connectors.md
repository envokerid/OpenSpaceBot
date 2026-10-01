# Connected apps through OpenClaw

OpenMausBot uses OpenClaw for native channel plugins and remote MCP connections.
OpenClaw runs on the same server as OpenMausBot; the OpenClaw company does not
receive these credentials. Each connected account gets a private OpenClaw
profile below `OMB_DATA_DIR/connectors/accounts/<id>` and a loopback-only,
token-authenticated Gateway process. Profiles are started on demand and stopped
when disconnected or when OpenMausBot shuts down. Each active account consumes
a separate runtime process and plugin installation; budget server memory and
disk accordingly. There is no shared-credential process pool.

## Connect

Open **Plugins → Connected apps** on desktop, or **Connected Apps** in Expo.
The initial native catalogue includes Telegram, Slack, Discord and WhatsApp.
Native channel accounts currently expose text-message sending. Telegram,
Slack and Discord use provider-issued bot/app tokens. WhatsApp uses its linked
device QR flow. This is a supported catalogue, not a promise that every
OpenClaw plugin can be installed or authenticated through this screen.

Use **Add remote MCP integration** for a provider's Streamable HTTP endpoint.
Choose browser OAuth, an access token, or no authentication. OAuth requires
standard MCP authorization discovery with a public client: dynamic client
registration or a pre-registered client ID. Confidential clients requiring a
client secret, stdio servers and provider-specific device-code adapters are
not supported by this form.

Each integration has a **Connect** action. Label additional accounts to keep
work and personal identities distinct; there is a five-account limit per
integration. Connecting does not grant access to any bot. Approve the exact
account for each bot, then let its normal action approval policy apply. There
is no default blanket approval for connector execution.

## Hosted and mobile authorization

Configure the server's public HTTPS URL before OAuth. Register
`https://YOUR-SERVER/oauth/mcp/callback` with providers that require a fixed
redirect. A reverse proxy must forward that path to the app. It is a public
callback authenticated by the single-use state issued by OpenClaw; it is not
an owner API. The app forwards the response to the account's private Gateway,
where OpenClaw validates state and PKCE and exchanges/stores tokens.

Expo opens the provider's sign-in link in the system browser, then polls the
connection status. The server needs no desktop or browser. For a local-only
server, a phone cannot reach the server's localhost redirect: the Connect
screen accepts the failed redirect's complete URL as a manual handoff. State,
callback origin/path and expiry are still checked. Public HTTPS is preferred.

For QR-only providers, open **Continue connecting** for the same account on
a desktop or another screen and scan with the provider's phone app. The same
pending session is reused. The phone does not pretend the QR is an ordinary
OAuth link. Requests expire after ten minutes; cancellation stops the account
runtime and deletes its profile. Completed callback reuse is rejected.

## Runtime boundary

The app imports the public Gateway client/protocol at **2026.8.1**, speaking
protocol 4 to **OpenClaw 2026.9.6**. The pinned adapter under
`runtime/openclaw/adapter` is the only component importing OpenClaw's
**experimental plugin SDK**. The SDK is necessary because the stable Gateway
alone does not expose remote MCP schemas, authorization and execution as a
complete connector interface. It is loaded inside OpenClaw, never bundled
into the app. An upgrade must pass `server/openclaw-gateway.test.ts` against
the real pinned runtime before either pin changes.

OpenClaw owns MCP transports, tool schemas, OAuth state, PKCE, credentials
and refresh. OpenMausBot owns the non-secret account inventory, connection
screens and bot grants. The agent-facing stdio bridge is only a gated app
transport to OpenClaw; it does not implement provider OAuth or store provider
tokens. Tool calls pin an exact account, validate its current schema and
recheck grants immediately before dispatch. Already-dispatched actions cannot
be undone by revocation. Interrupted calls are never retried automatically.

OpenClaw profiles have owner-only permissions on Unix. They are excluded from
workspace backups. Do not assume OS-keychain encryption for OpenClaw's own
token stores. Separate profiles prevent accidental default-account routing;
they are not OS sandboxes for hostile plugin code. Installation of arbitrary
third-party plugins is intentionally not exposed by the app API.

## Install and package

Use Node **24.16.0** (or a version supported by the pinned OpenClaw release)
and `pnpm install` for source development. Desktop packaging runs
`pnpm build:openclaw`, deploying a complete runtime outside ASAR with pinned
npm and a checksum-verified Node executable for each target.
`pnpm build:openclaw --current` stages only the current architecture. Docker
copies the same pinned runtime into its image. The npm distribution installs
these pinned packages as dependencies and ships the adapter alongside them.

On first Connect, OpenClaw installs the selected official native plugin at
**2026.9.6** through its `plugins.install` API (Telegram is bundled).
This requires access to npm and can take a few minutes. OpenClaw records
trusted provenance and verifies the installation; an unpacked local directory
is insufficient for plugins that require trusted state APIs. Arbitrary package
names, installation overrides and automatic upgrades are not exposed.
The registry supplies software packages; the downloaded plugins execute on
this server. Their upstream authorship and license notices are preserved.
This setup depends on upstream packages for installation and updates, and
does not provide an offline mirror or a fork maintained by OpenMausBot.

`OMB_OPENCLAW_RUNTIME` can select the complete runtime directory;
`OMB_OPENCLAW_NODE` can select its real Node executable. Never point them to
Electron or to a user's separately configured OpenClaw profile. Gateway
processes bind only loopback and do not receive the app's other credentials.

## Migration

The previous managed broker, project-key settings and remote sessions are
removed. Old tokens cannot be transferred: users must reconnect providers
and explicitly grant each new account. Saved bot connector-off settings
remain off, and old account IDs are discarded. Old credential names remain
only in migration/redaction safeguards, so inherited secrets are neither
used nor leaked to an engine. Retiring a local credential does not revoke an
old provider grant at the provider itself.

## Verification

Run `node --experimental-strip-types scripts/verify-openclaw.ts` for the
complete app → OpenClaw OAuth callback and grant flow against a fake provider.
It uses the canonical isolated launcher and records evidence beside its log.

`server/openclaw-gateway.test.ts` launches the real pinned Gateway against an
isolated HTTP MCP/OAuth fixture. It checks discovery, execution, PKCE, wrong
state and callback replay, plus bundled Telegram activation and refusal to
send without credentials. Connector lifecycle and grant checks use isolated
fixtures; no live account is used. Set `OMB_VERIFY_OPENCLAW_PLUGINS=1` to
also test installation and activation of the official native plugins (requires
npm network access). Run the relevant server, shared, UI and
Expo tests. Visual verification belongs to the user under `AGENTS.md`.

### Validation on 2026-10-01

Passed: root and Expo type checks, lint, locale checks, the desktop production
build, Linux runtime staging, packaged-server smoke, focused connector,
approval, driver and Electron credential-migration tests, all 109 Expo tests,
and all 549 Android core tests. The real staged Gateway passed remote MCP
discovery/execution, OAuth/PKCE and bundled Telegram activation checks; a
Telegram send without credentials was refused.

The canonical app OAuth fixture passed callback forwarding, wrong-state and
replay rejection, explicit account grants and disconnect cleanup at isolated
URL `http://127.0.0.1:20632`. Its retained evidence is
`/tmp/openmausbot-verification-evidence/server-1790867587192-578908.log`.
The fixture was stopped and its temporary account data removed.

Verification remains incomplete in these areas:

- Official native-plugin installation through the staged runtime failed at
  `npm view @openclaw/slack@2026.9.6` with `ETIMEDOUT`. Slack, Discord and
  WhatsApp installation/activation need the opt-in check above on a working
  network. No real provider account or outbound message was used.
- Android app unit tests could not download `com.ibm.icu:icu4j:77.1`; an
  offline retry confirmed that dependency was missing. App source compilation
  passed. iOS was not built on this Linux host, and UI visuals were not checked.
- The broad Vitest run was interrupted after failures; it is not a full-suite
  pass. The delegation-fixture regressions were corrected and their focused
  reruns passed. Eight index-test timeouts passed with a 60-second limit.
  Six remaining index assertions (four VM/configuration cases, profile
  validation and setup-prompt ordering) and one independent-thread assertion
  also fail on checkpoint `a86489ab`, before this migration. Those existing
  failures were not changed here.

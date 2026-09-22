# OpenMausBot connected-apps broker

This Worker keeps the shared Composio project key out of desktop builds. Each
installation receives a random bearer token stored only as a SHA-256 hash in
D1. The Worker gives that installation its own Composio user/session, proxies
MCP traffic, and returns short-lived Connect Links to the local app.

The desktop never receives the project key. Authorization links are returned
only on demand and are never persisted in chat messages.

Deployment for this repository:

1. `pnpm broker:types`
2. `pnpm exec wrangler d1 migrations apply openmausbot-composio --remote --config cloudflare/composio-broker/wrangler.jsonc`
3. For an existing Worker, run `pnpm exec wrangler secret put COMPOSIO_API_KEY --config cloudflare/composio-broker/wrangler.jsonc`, then `pnpm broker:deploy`.
4. For the very first deploy, put `COMPOSIO_API_KEY=...` in the ignored `.dev.vars.production` file and run `pnpm exec wrangler deploy --config cloudflare/composio-broker/wrangler.jsonc --secrets-file .dev.vars.production`. Delete the file immediately afterward.

Forks should create their own D1 database and rate-limit namespaces, replace
the IDs in `wrangler.jsonc`, deploy under their own Worker name, and set
`OMB_COMPOSIO_BROKER_URL` in their packaged build. Running only the local
server with a Composio project key remains the no-Cloudflare self-host path.

Set `REGISTRATION_MODE` to `closed` to stop issuing new installation tokens
without affecting existing users.

## Per-bot account approvals

Desktop builds that enforce account approvals use `POST /v1/mcp/scoped`.
Deploy this broker version before testing those builds against the hosted
service. Account listing and OAuth can still work on an older broker even
though bot tool startup fails with HTTP 404. Reconnecting the account or
granting the bot access again does not fix that version mismatch.

The scoped route creates a session restricted to the approved toolkit and
account IDs. The existing `/v1/mcp` route remains available for older desktop
builds. New builds must not fall back to that unrestricted route on failure.
This update needs no database migration or credential rotation.

Validate the update before deployment:

```sh
pnpm broker:test
pnpm exec tsc -p cloudflare/composio-broker/tsconfig.json
pnpm exec wrangler deploy --dry-run --config cloudflare/composio-broker/wrangler.jsonc
```

Deployment requires Cloudflare access to the account owning this Worker and
its existing D1 database. After signing in with `pnpm exec wrangler login`,
run `pnpm broker:deploy` from the repository root. Preserve the existing
`COMPOSIO_API_KEY` secret and database binding.

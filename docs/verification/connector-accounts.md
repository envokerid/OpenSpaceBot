# Connector accounts

Run `pnpm exec vitest run server/connectors.test.ts server/openclaw-gateway.test.ts server/connector-proxy.test.ts src/components/PluginsPanel.test.ts`.
These use temporary profiles and fake providers. The OpenClaw contract test
runs the actual pinned runtime. `server/index.test.ts` also checks owner-only
grant management, exact account selection, disconnect pruning and revocation
during a delayed request body against an isolated app server.

For the paired Expo account-grant flow, run
`node --experimental-strip-types expo/scripts/verify-connector-accounts.ts`.
It launches its own isolated server through the canonical verification launcher.
Do not point these fixtures at a live app. Visual checks are left to the user.

See [architecture and auth](../openclaw-connectors.md).

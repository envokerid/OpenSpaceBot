# Expo group setup

Expo creates groups with completed setup in the same request. The first chosen
bot is the default responder, matching the server's existing default; the
creation form explains how to mention other members.

Older unfinished groups show **Start chatting** before the first message.
This calls the existing setup endpoint with `action: skip`, preserving the
group's members, default responder, instructions, folder and thread. Both the
Send button and keyboard-send handler wait until setup is finished. DMs,
legacy groups without setup markers and completed groups stay usable.

The companion now allows authenticated `PATCH /api/groups/:id/setup` requests.
Desktop UI and the server's setup validation are unchanged. A running desktop
companion must restart to pick up the route change.

## Regression checks

From the repository root, with Node 24:

```sh
node --experimental-strip-types expo/scripts/verify-server.ts
node_modules/.bin/vitest run companion/test/routes.test.ts
```

From `expo/`:

```sh
npm run typecheck
npm test
```

`verify-group-setup.ts`, called by the existing isolated server recipe, proves:

- A new mobile group is configured atomically and its first send receives a
  fake-engine reply.
- The old creation payload reproduces the setup error without storing a message.
- Start chatting recovers that same group without changing its configuration.
- Repeating the setup action is idempotent and fleet reload keeps the result.
- The recovered group can send and receive a reply.

The recipe retains bounded channel transcripts, wait results and action/state
evidence beside the printed server log. It never uses a live app or user data.
Unit coverage checks legacy, DM, absent-message and completed-marker handling;
companion route tests check authentication, HTTP method and path boundaries.

## Verified on 2026-09-22

TypeScript, lint, all 24 Expo unit tests and all 86 companion route tests passed.
The real server/proxy recipe, including both group message flows, passed.

On a fresh Pixel 7 Android 36 AVD (`omb_group`, `emulator-5584`), the real Expo
UI preserved a typed draft while Start chatting completed setup, enabled Send,
and displayed the fake-engine reply. A second group created through New group
with two selected bots sent and received its first message immediately.
Screenshots and UI XML confirmed both outcomes. iOS native behavior was not
exercised. The fixture, Metro and disposable emulator were stopped afterward.

UI command record, screenshots, XML and bounded message/wait evidence:
`/tmp/omb-group-iedakr0p/`.
Server/companion evidence:
`/tmp/openmausbot-verification-evidence/server-1790054942888-151682.log.expo.json`.

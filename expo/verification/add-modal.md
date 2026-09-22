# Expo roster Add modal — 2026-09-22

The Expo roster uses one **Add** button to open a sheet with **Bot** and
**Section** tabs. Section drafts survive tab switches. Creation uses the
existing bot and sidebar-section APIs; the separate New group flow remains.
Desktop/web sources were not changed for this task.

TypeScript and lint passed for the updated components. Native acceptance used
a fresh Pixel 7 Android 36 AVD (`omb_add`, `emulator-5584`) and the isolated
fake-engine server/companion from `expo/scripts/verify-server.ts --interactive`.
Metro ran on port 8100 with `CI=1` to avoid the host's file-watcher limit.

Verified through the real Expo Android UI and resulting fixture API snapshots:

- Add opens the tabbed sheet without creating a bot.
- Section submission is disabled until a name and bot are selected.
- Switching to Bot and back preserves the section name and selected bot.
- Create section creates `UI test`, assigns Cosmo, and shows it in the roster.
- Opening Add and canceling leaves bot counts and sections unchanged.
- Create bot disables controls while pending, creates exactly one bot, and
  opens that bot's chat.

Light-theme screenshots of both tabs were inspected. iOS native behavior was
not exercised. The fixture's protocol checks and final revocation check passed.
The fixture, Metro, and disposable emulator were stopped after verification.

Action/state evidence, screenshots, XML, helper script, and command record:
`/tmp/omb-add-2qad12no/` (`checks.json` contains the asserted outcomes).
Server evidence:
`/tmp/openmausbot-verification-evidence/server-1790052272332-23921.log.expo.json`.

Reproduce with the [isolated Expo fixture recipe](../../docs/verification/expo-companion.md),
then open Add on the roster and follow the actions above. Never use a saved
user emulator or live app for mutation checks.

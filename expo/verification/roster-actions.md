# Expo roster bot actions

Hold a bot on the home list for 450 ms to open Edit, Rename and Delete.
Normal taps still open chat. Edit opens the existing bot settings sheet;
Done returns to the roster. Rename trims the name and rejects blank or
unchanged names. Delete names the selected bot and requires confirmation.
Mutations are disabled while pending and errors remain in the dialog.
The menu follows the existing admin permission and exposes an accessibility
long-press action.

The companion now permits authenticated `DELETE /api/bots/:id`; its exact
path and authentication boundaries are tested. Restart a running companion
to load this route. Desktop UI is unchanged.

## Verification, 2026-09-22

Passed TypeScript, targeted lint, 30 Expo tests and 87 companion route tests.
Using Node 24 from the repository root:

```sh
node --experimental-strip-types expo/scripts/verify-server.ts --interactive
node_modules/.bin/vitest run companion/test/routes.test.ts
npm run typecheck --prefix expo
```

The isolated server recipe invokes `verify-roster-actions.ts` to verify blank
name rejection, trimmed rename with preserved transcript and thread, profile
editing, and selected-bot deletion without removing other bots. Server,
companion, bounded transcript and wait evidence:
`/tmp/openmausbot-verification-evidence/server-1790059021007-337919.log.expo.json`.

A disposable Android 36 emulator (`omb_roster`, `emulator-5584`) ran the real
Expo app against that fixture. UI XML, screenshots and server snapshots prove:

- A normal tap opens chat; a hold opens the three-action menu on the roster.
- Edit opens Bot settings and Done returns to the roster.
- Rename saves `Roster Renamed` to the same bot.
- Delete followed by Cancel preserves the bot.
- Confirmed deletion removes only that bot from both the roster and server.

Native evidence and action sequence: `/tmp/omb-roster-9j47bbv9/`.
The emulator crashed once before the gesture check and was restarted; all
remaining checks passed after restart. iOS was not exercised. All mutations
used disposable fixture data. The owned fixture, Metro and emulator were stopped.

## Hold feedback

`RosterBotPressable` gently scales the row to 97.5% over the 450 ms hold and
springs back on release, cancellation or menu opening. Reduce Motion disables
the scale animation. Only opening the menu triggers haptics, including the
accessibility action: Android uses its native long-press feedback and iOS a
light impact through `expo-haptics`. Unsupported haptics never block the menu.

TypeScript, targeted lint, Android/iOS production bundle exports and the Android
debug build for arm64-v8a/x86_64 passed. Build log:
`/tmp/omb-roster-haptics-build.log`; export log:
`/tmp/omb-roster-haptics-export.log`. The haptic API follows the
[Expo Haptics reference](https://docs.expo.dev/versions/latest/sdk/haptics/).
Physical haptic feel and this
animation were not verified on a device. Existing development clients need
a native rebuild/reinstall for the newly added haptics module.

## Group chat deletion (2026-09-22)

Hold a group chip on the home screen for 450 ms to open Delete. The confirmation
names the group and explains that its history is deleted while member bots are
kept. Cancel and outside dismissal preserve the group. Pending deletion disables
the dialog controls; server errors stay visible for retry. Normal taps still
open chat. The action follows the existing administration permission and exposes
an accessibility long-press action. The group chip inside chat is unchanged.

The companion now permits authenticated `DELETE /api/groups/:id`. Restart a
running companion to load the new route. Tests cover authentication, exact
paths, collection rejection and encoded path rejection.

Verification passed:

- Expo TypeScript, targeted lint, whitespace checks, all 53 Expo tests and all
  94 companion route tests.
- `node --experimental-strip-types expo/scripts/verify-server.ts` with Node 24
  launched its own isolated server and companion. The extended
  `verify-roster-actions.ts` confirmed deletion through the production client,
  refreshed session state, missing deleted transcript, and preserved member bots
  and other groups. Full action/state and bounded transcript/wait evidence:
  `/tmp/openmausbot-verification-evidence/server-1790086985263-1442190.log.expo.json`.
- A disposable React Native Web fixture mounted the real Roster and its group
  actions with simulated requests. It verified normal taps, held pointer presses,
  outside dismissal, Cancel without a request, disabled pending controls,
  selected-group removal, retained bots/other group, recoverable server errors
  and read-only restrictions. Evidence, executable fixture/check scripts and
  light/dark captures: `/tmp/omb-group-delete-00wmz6gh/`.

The browser plugin had no available browser; UI verification used a fresh
headless browser. Native Android/iOS gestures and accessibility actions were not
exercised. All mutation checks used disposable data.

## Move a bot to a section (2026-09-22)

The bot's existing hold menu now includes **Move to section**. The picker marks
its current section and offers named sections from fleet metadata, visible bots
and groups, including empty sections. **No section (Bots)** returns it to the
unsectioned list. **New section** accepts a trimmed name of up to 60 characters.
Save applies the change to only the selected bot through the existing
`POST /api/sidebar-sections` companion route. Blank new names and unchanged
assignments cannot be saved. Cancel discards the selection, pending requests
block edits/dismissal, and errors remain in the picker for retry.

The hold accessibility hint includes moving sections. The shared radio row now
also exposes `aria-checked`, because React Native Web did not expose its existing
native `accessibilityState.checked` in the verification fixture.

Verification passed:

- Expo TypeScript, targeted lint, whitespace checks and all 53 Expo tests.
- The Node 24 isolated `verify-server.ts` recipe, extended in
  `verify-roster-actions.ts`, moved the same bot into a trimmed new section, an
  existing empty section, and no section. Each refreshed state matched; bot
  identity, selected thread, transcript and other bots' assignments were
  preserved. Server action/state evidence and bounded transcripts/waits:
  `/tmp/openmausbot-verification-evidence/server-1790090362287-1511257.log.expo.json`.
- A disposable React Native Web fixture mounted the real Roster, hold menu and
  section picker. Checks covered current selection, all existing menu actions,
  empty sections, Cancel without a request, single-bot save, pending controls,
  reopened saved assignments, clearing a section, trimmed creation via keyboard,
  blank/length validation, error recovery and read-only restrictions. Light/dark
  picker and error screenshots were inspected. Scripts, screenshots and results:
  `/tmp/omb-bot-section-4q3bc5f9/`.

UI requests were simulated in a fresh headless browser; production API checks
used the isolated server and companion. Native Android/iOS gestures and screen
readers were not exercised. Owned fixture processes were stopped.

### Follow-up: desktop served an older companion build

The source-only group-delete check above missed an old `dist-companion` build
preferred by the development desktop. The actual Electron-launched companion
reproduced the reported `no route: DELETE` error. Development entry selection now
prefers source, and the local compiled companion was rebuilt. The expanded
[desktop companion fixture](../../docs/verification/companion-ports.md) verifies
paired group deletion through the real Electron launch path, with retained
before/after evidence. Running processes need a restart to load the route.

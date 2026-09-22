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

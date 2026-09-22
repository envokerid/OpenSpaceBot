# Bot permissions — 2026-09-22

Open a bot's settings from its chat avatar, then **Permissions**.
The Expo screen ports Chief of Staff, additional teams, teammate-contact
approval and provider-supported Ask / Edits / Auto defaults. Full and Custom
remain visible as saved values, but their trusted transitions stay in the
packaged desktop. Custom cannot be changed from the phone.

The new `PATCH /api/bots/:id/permissions` endpoint accepts a strict subset of
fields and reuses the desktop handler's persistence, Chief handover, team
acknowledgement, busy guard and local Auto warning checks. Standalone server
sessions need admin scope. The companion permits this endpoint while keeping
the general bot settings endpoint blocked.

## Checks

- Expo TypeScript and all 19 protocol/state tests pass.
- Server TypeScript, scoped lint and 123 companion-route/auth tests pass.
- Isolated server regressions pass for the narrow permissions route, local
  Auto acknowledgement, and refusal to change a saved Custom grant.
- Android, iOS and web exports pass. This does not prove iOS native behavior.
- `expo/scripts/verify-server.ts` pairs through a real isolated companion,
  checks Chief handover, team grants/revocation, peer approval, thread-default
  inheritance, unchanged existing threads, and rejected elevated/unrelated
  writes and changes while busy. It retains action/state JSON next to its log.
  The final fresh run passed and cleaned up its fixture; evidence:
  `/tmp/openmausbot-verification-evidence/server-1790052322094-29039.log.expo.json`.
- A fresh Android 36 emulator (`omb_permissions`, `emulator-5586`) ran Expo Go
  57 against that isolated fixture. UI taps saved Chief, additional-team access,
  peer approval and Edits. Cancelling the local Auto warning preserved Edits;
  confirming it saved Auto with the local computer still selected.
  No user app, pairing registry, or live workspace was used.

Screenshots: [permissions](screenshots/bot-permissions.png),
[approval selection](screenshots/bot-permissions-approval.png),
[local Auto warning](screenshots/bot-permissions-local-warning.png).
The selected screenshots above survived a runtime restart. Temporary Android
UI XML and action/state files did not; the final dark-mode/reopen check was
interrupted and is not claimed. Follow the
[fixture recipe](../../docs/verification/expo-companion.md) to reproduce.

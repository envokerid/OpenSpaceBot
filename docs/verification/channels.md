# Channels

## Sub-features

- Create a channel from existing bots.
- Send to its active task.
- Wait for the room-level run rather than one member's transient state.
- Read a bounded channel transcript.

## User path

Create a channel from the sidebar, choose its members, and send a message in
the channel composer.

## Driving it

Create two fixture bots with `new-bot`, then:

```sh
pnpm control:omb new-channel --name Review --members BOT_A_ID,BOT_B_ID --url http://127.0.0.1:PORT
# Copy channel.id from the JSON above as CHANNEL_ID.
pnpm control:omb send-channel --channel CHANNEL_ID --text "Reply once" --url http://127.0.0.1:PORT
pnpm control:omb wait --channel CHANNEL_ID --timeout 60 --url http://127.0.0.1:PORT
pnpm control:omb messages --channel CHANNEL_ID --limit 20 --url http://127.0.0.1:PORT
```

Capture the returned channel ID from `new-channel`. The wait result must be
`settled`; the transcript is the evidence.

## Gotchas

- Do not wait directly on a bot while it is speaking for a channel.
- A confirmation card produces `needs-user`; it is not a timeout.
- This first map does not claim to verify channel layout or sidebar UI.

## Editing an existing group's members

On desktop, open the group and choose **Manage members** in its header. In
Expo, open the group and tap the header's **+** (**Manage members**). Select
the additional bots and save. Current members are preselected; Cancel discards
the draft. Direct-message channels keep their fixed membership.

```sh
OMB_UI_E2E=1 pnpm exec vitest run scripts/testing/group-members-ui.e2e.test.ts
node --experimental-strip-types expo/scripts/verify-server.ts
```

Both commands launch disposable fake-engine fixtures. The desktop recipe
checks Cancel, adding a bot, preserved transcript/thread/default responder,
the persisted roster, reopening the picker, conflicting device edits, and a
failed save followed by retry. It retains evidence under
`.omb-scratch/verify-evidence/group-members/`.

The Expo recipe drives the production mobile client through a paired companion
proxy. It checks roster updates over SSE and reload, duplicate IDs, stale
rosters, empty/unknown members, and rejection of unrelated fields. Its printed
`.expo.json` evidence stays beside the server log. The narrow
`PATCH /api/groups/:id/members` route retains the server's busy/approval and
fixed-DM checks; hosted sessions still need admin scope.

For native acceptance, follow [Expo companion](expo-companion.md) with a fresh
emulator. Open an existing group, tap Manage members, select another bot, save,
and reopen to confirm both checkboxes. Cancel another selection and confirm
the server roster did not change. iOS needs a separate simulator/device check.

Verified on 2026-09-22: desktop renderer regression, companion/API fixture,
and a fresh Android 36 Pixel 7 emulator (`omb_members_fixture`,
`emulator-5712`). Android added a bot, reopened with both members selected,
and cancelled another selection without changing the saved roster. Native
screenshots, UI XML and API assertions are in `/tmp/omb-members-OPXKW4/`;
companion evidence is
`/tmp/openmausbot-verification-evidence/server-1790054767437-139981.log.expo.json`.
Typechecks, targeted tests and lint passed. This does not verify iOS runtime
or Electron shell behavior.

## Chief room management

```sh
pnpm exec vitest run server/chief-rooms.e2e.test.ts
pnpm exec vitest run server/index.test.ts -t 'Chief room|team-goal lead|credential-card ownership'
```

The end-to-end test launches the isolated control fixture, creates disposable
bots, starts its fake Chief engine and uses that turn's mounted agents MCP
proxy. It creates a room, renames it, changes members and its bulletin, then
checks the saved state. A foreign-section member is refused; stopping the
owning turn revokes the proxy's permission to rename the room. The test retains
its control commands, tool results and final state beside the printed server
log, without recording the bearer token, and removes its temporary home.

The API regressions exercise spoofed sender/thread claims, slow expired
requests, current Chief status, peer allow-lists, hidden bots, creation limits,
busy rooms, pending approvals, goal leads and in-flight credential saves.
Public channel creation and edits use the same validation as the Chief tools.
Chiefs cannot move rooms/bots between sections, remove themselves, or change
working folders. Chiefs configured to require peer approval must ask the user
to make room changes; these tools do not add a separate approval workflow.

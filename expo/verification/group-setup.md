# Expo group setup

Expo creates groups with completed setup in the same request. The first chosen
bot is the default responder, matching the server's existing default; the
creation form explains how to mention other members.

New group includes optional multiline **Group instructions**, using the same
shared field and settings styling as the existing group's editor. Instructions
are sent in `setup.bulletin` during creation, with a 12,000-character limit.
Back discards the draft; failed creation keeps the name, instructions and
selected bots for retry. The header uses the same Back label and side spacing
as the group editor.

The New group sheet slides in and can be dragged downward from its top handle
or header. A pull over 100 points, or a downward flick over 24 points at more
than 0.6 points/ms, dismisses it; shorter pulls return it to place and retain
the draft. The form remains independently scrollable. Swipe dismissal is
disabled during creation. Back and outside dismissal also animate downward;
reduced-motion preferences skip settling/entrance/exit animations.

Swipe verification used the disposable React Native Web fixture at
`/tmp/omb-new-group-swipe-d98_f3wg/`. `swipe-results.json` records header tracking,
snap-back, ignored horizontal/upward gestures, independent form scrolling,
handle/title dismissal, fast flicks, draft reset, busy/error recovery and
reduced motion. `new-results.json` and `results.json` record the creation and
existing editor regression checks. The mid-drag screenshot `dragging.png` was
visually inspected. Expo TypeScript and lint passed; fixture processes were
stopped. These checks used simulated pointer gestures, not a native device.

The initial browser-only verification above missed an Android touch failure.
The header now claims the initial native touch and keeps a concrete native
view for its drag area. The fix also enables swipe dismissal on group details.
See [native sheet swipe verification](group-sheet-swipes.md) for the reproduced
failure and Android checks of the final code.

## Group instructions creation verification (2026-09-22)

- Expo TypeScript, changed-file lint and whitespace checks passed.
- The real isolated server/companion recipe passed creation with multiline
  Unicode instructions, persistence after fleet reload, optional empty
  instructions, and the new group's first message. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790077159172-1245889.log.expo.json`.
- A disposable React Native Web fixture mounted the real Roster, NewGroupSheet,
  Chat and GroupMembers components. It checked creation, member order, opening
  saved instructions, Back/reset, failed-creation retry, optional instructions,
  the length limit, and existing group edit flows. Light/dark screenshots were
  visually inspected. Evidence: `/tmp/omb-new-group-instructions-eex4apoi/`
  (`check-new.cjs`, `check-existing.cjs`, `new-results.json`, `results.json`,
  `new-group-light.png`, `new-group-dark.png`).
- All fixture processes were stopped. Native keyboard/device rendering was not
  exercised for this change.

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

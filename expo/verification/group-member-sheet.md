# Group member sheet

The group identity chip opens a sheet titled with the group's name. Editable groups offer
shared group instructions above the member selection, with one Save for both.
Instructions support multiple lines and up to 12,000 characters; clearing the
field removes them. Read-only connections and bot DM groups show their
instructions and members without editing controls. The sheet slides upward on
open and stays mounted while sliding downward on outside tap, Cancel or Save.
Reduced-motion preferences skip the movement. Outside dismissal discards edits.
Other sheets retain their existing fade transition.

The group details sheet can also be dragged down from its handle or header.
Short pulls snap back; Save blocks dismissal while pending. Its native touch
handling shares the New group fix and was verified on a fresh Android emulator:
[native sheet swipe verification](group-sheet-swipes.md).

The sheet uses the same `SettingsSurface`, `FormSection` and `Input` components
as bot settings: neutral light/dark colors, muted section labels, rounded filled
inputs and settings typography. The group name is shown once in the sheet header.

The styling update passed Expo TypeScript, lint and the isolated React Native
Web interaction fixture, including Save, Cancel, read-only presentation and
failed-save retry. Light and dark screenshots were visually inspected. Evidence:
`/tmp/omb-group-prompt-style-75yfzezf/` (`results.json`,
`group-instructions-light.png`, `group-details-dark.png`). The fixture was stopped;
native keyboard/device appearance remains unverified.

The group header uses Back and Save with 16-point horizontal header padding
(previously 4). Back still discards unsaved edits. This passed Expo TypeScript,
lint and the isolated UI fixture, with the light screenshot visually inspected:
`/tmp/omb-group-header-spacing-9txnvufn/` (`results.json`,
`group-instructions-light.png`). Other sheets retain their existing labels and
spacing.

The companion's existing `PATCH /api/groups/:id/members` route accepts optional
`bulletin` and `expectedBulletin` together. It compares the opened roster and
edited instructions before applying either change, rejects stale edits, and
retains the existing busy-room and access checks. Member-only requests preserve
instructions, including changes made by another device while the sheet is open.

Group instructions verification on 2026-09-22:

- Expo and server TypeScript checks and lint passed for the changed files.
- The isolated server/companion fixture passed adding, editing and clearing
  instructions, a combined roster/instruction save, SSE delivery, reload,
  member-only compatibility, and stale/malformed/oversized rejection without
  partial updates. Run:
  `node --experimental-strip-types expo/scripts/verify-server.ts`.
  Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790075932251-1163903.log.expo.json`.
- A disposable React Native Web fixture mounted the real Chat and GroupMembers
  components and checked chip opening, combined Save, reopening saved text,
  Cancel/outside dismissal, draft retention after a rejected save and retry,
  clearing, read-only/DM presentation, and the length limit. Light and dark
  screenshots were visually inspected. Fixture and evidence:
  `/tmp/omb-group-instructions-nzdiwjpl/` (`build.cjs`, `check.cjs`,
  `results.json`, `group-details-light.png`, `group-details-dark.png`).
- Fixture processes were stopped. Native keyboard behavior and device rendering
  were not exercised.

Verified on 2026-09-22:

- Expo TypeScript and lint passed for the changed components.
- A disposable React Native Web fixture mounted the real Chat, GroupMembers and
  Sheet components. Recorded frame positions proved upward entrance and downward
  dismissal before unmounting. It also checked direct opening, member removal
  and addition, Save, Cancel, and discarding unsaved edits on outside dismissal.
  Fixture code, screenshots and frame evidence:
  `/tmp/omb-group-header-SmCeu0/` (`build.cjs`, `check-sheet.cjs`,
  `sheet-open.png`, `sheet-results.json`).
- `node --experimental-strip-types expo/scripts/verify-server.ts` passed against
  its isolated server and companion. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790073175754-1001518.log.expo.json`.

All fixture processes were stopped. Native runtime animation and reduced-motion
behavior were not exercised on a device.

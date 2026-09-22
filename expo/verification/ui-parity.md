# Mobile UI comparison — 2026-09-21

This is an Android comparison record, **not a claim of complete native parity**.
The original Compose preview, Expo development client and Expo Go 57.0.9 ran on
one disposable Pixel 7 Android 36 emulator (`omb_ui_parity`, `emulator-5582`).
The main viewport was 1080 × 2400 at 420 dpi; profile controls were also checked
at 945 × 2100. Font scale was 1.0. Both light and dark appearance were exercised.
All apps connected to the same isolated desktop companion/fake-engine fixture.
No live desktop, saved user emulator or user pairing registry was modified.

The user has no Mac available. iOS sources were inspected and the iOS JavaScript
bundle exports, but **iOS native compilation, simulator layout and device
behavior have not been verified**. In particular, the original SwiftUI grouped
Settings/navigation and language/intro preferences are not reproduced by the
shared Android-style Settings screen.

## Android screen record

“Compared” means the named states were opened in both apps and their screenshots
inspected. It does not mean every possible server payload or device state was
covered. Screenshots are original on the left and Expo on the right.

| Screen | Compared states / exercised behavior | Evidence |
| --- | --- | --- |
| Welcome and unpaired home | Welcome copy, benefits, buttons, empty home, settings entry | [Onboarding](screenshots/onboarding.png) |
| Pairing | Manual address, confirmation, notifications onboarding; separate native, development-client and Expo Go pairing | Full captures in `/tmp/omb-ui-parity/`; automated pairing recipe below |
| QR scanner | Camera permission prompt and camera surface; header and caption | [Camera / Computer](screenshots/camera-computer.png) |
| Roster | Bots, group avatars, sections, expanded threads/folders, search, unread and waiting state | Original/Expo roster captures in `/tmp/omb-ui-parity/` |
| Updates | Needs-you / working / review groups and opening a conversation | `original-updates`, `expo-updates` captures |
| New group / section | Group and section forms; created group with two members and assigned Sprout to UI checks | [Fixture state](fixture-state.json) |
| Chat | Empty and populated, keyboard, composer menu/slash commands, light/dark; sent text from Expo Go and received desktop reply | [Chat](screenshots/chat.png) |
| Message actions | Copy/select text, edit/retry and previous/next version; edited text reached server | [Chat](screenshots/chat.png) |
| Permission approval | Pending/answered card; Allow tapped in Expo and actual permission broker resumed | `original-approval-pending`, `expo-approval-pending-v2` captures |
| Structured questions | Two tabs, automatic next unanswered question, multiple choice, submit and settled answer; actual broker received Light + Android/Connection | [Questions](screenshots/questions.png) |
| Attachments | Message-scoped image and text downloads, thumbnail/file row, image preview, horizontally scrolling text preview | [Attachments](screenshots/attachments.png) |
| Thread picker | Folder grouping, rename, archive/unarchive, delete confirmation; temporary thread created, renamed, archived and deleted in Expo | [Threads](screenshots/threads.png) |
| Bot profile | Model/provider/effort, overview, avatar/crop choices, identity, notifications switch, unconfigured voice provider; narrower viewport | [Profile](screenshots/profile.png) |
| Computer | Idle/unavailable cloud desktop state | [Camera / Computer](screenshots/camera-computer.png) |
| Settings | Paired/unpaired, address, activity detail, quick replies, unpair dialog | [Settings](screenshots/settings.png) |
| Connected apps | Unconfigured provider inventory, dark theme | [Connected apps](screenshots/connected-apps.png) |
| Threads & Routines | Empty/populated list, editor, daily/interval schedules, time picker, action menu and expanded run receipt; create and Run now exercised through UI | [Routines](screenshots/routines.png), [fixture state](fixture-state.json) |

Captures were taken during the comparison pass, not all after the last edit.
Some show Expo's development-tools button (disabled later), earlier dialog
spacing, different scroll position/current thread, or a different mascot
animation frame. Thread dialog spacing and the unpaired handset icon were
corrected after those captures. Android and React Native font rasterization and
system-bar treatment still differ slightly. These are review evidence, not
pixel-diff golden tests.

## Changes driven by comparison

- Matched Material surfaces, spacing, button shapes, dialogs, headers, switches,
  composer placement and responsive profile layout.
- Added shared mascot geometry/expression animation, group avatar stacks,
  waiting badges, working bubbles and structured-question tabs/options.
- Matched attachment rows, message action menus, version controls, thread
  dialogs, quick replies and routine run receipts.
- Fixed UTF-8 response decoding, folder search/order, reduced activity folding,
  roster preview freshness and marking visible incoming replies read.
- Guarded notifications and dictation imports in Expo Go. A separate eagerly
  imported dictation module also caused Fast Refresh errors; the guarded
  implementation now lives in one module. Cold launch and subsequent edits
  were exercised in Expo Go without that error.

## Checks

- TypeScript and lint pass.
- 16 protocol/state tests pass.
- Android, iOS and web exports pass; Android development APK built/installed.
- Fresh isolated real companion API verification passed. Retained evidence:
  `/tmp/openmausbot-verification-evidence/server-1790006924013-398098.log.expo.json`.
- Android GUI operations against the interactive fixture included sends,
  approvals, structured answers, message edit/version switching, group/section
  creation, thread mutations and a completed routine run. A redacted snapshot
  is saved alongside this report. It contains no credentials.

Reproduce with [the isolated fixture recipe](../../docs/verification/expo-companion.md).
The full native/Expo PNG and UI XML set is in `/tmp/omb-ui-parity/` for this session;
selected comparisons above are kept in the repository. The interactive fixture
was stopped cleanly after the UI pass; its final revocation check passed and
its evidence is `/tmp/openmausbot-verification-evidence/server-1790000096052-184175.log.expo.json`.
The Expo Go development server on port 8081 remains running.

## Remaining acceptance / implementation gaps

Do not treat this port as a complete replacement for the native apps yet.

- Physical LAN/Tailscale routing, real QR decoding, actual photo/document picking,
  voice recognition/TTS playback, provider sign-in, cloud desktop frames and
  share targets need device/provider acceptance. No real accounts were used.
- Expo Go cannot provide the custom dictation module, notification integration
  or incoming-share native targets. Those require the development build.
- Bonjour discovery, Android foreground connection service, encrypted credential
  entry, complete Walkie/automatic spoken replies, iOS widgets/Live Activities,
  and all original mascot transitions are not implemented.
- Android image pinch/pan and rendered Markdown file previews are not at native
  parity. Rich profile/team/routine proposal and transcript cards need further
  screen comparisons. Routine calendar/context attachment editing and batch
  thread operations are not ported.
- The native Android routine editor also limits exposed schedule types. Expo
  preserves existing cron/interval restrictions, but does not offer editors for
  cron, interval windows, channel targets or run cancellation.

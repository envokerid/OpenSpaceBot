# Native group sheet swipe verification

Verified on 2026-09-22 after reproducing the failure on Android: the old
move-only responder never received the handle/header drag. Browser mouse
checks had passed but did not cover this native behavior.

`useSheetSlide` now claims the initial touch in header space. Header buttons
retain their own tap responders, and the drag area is kept as a native view.
Both NewGroupSheet and GroupMembers enable the gesture, except while saving.

## Isolated native fixture

Evidence and fixture source: `/tmp/omb-native-sheet-drag-sa2_t34c/`.

- Created a fresh Pixel 7 Android 36 AVD (`omb_sheet_drag`) under that temporary
  directory, with a separate `ANDROID_AVD_HOME`; device `emulator-5586`.
- Installed `expo/android/app/build/outputs/apk/debug/app-debug.apk` only on
  that device. The fixture's Metro server used port 8117 and its own Expo entry.
- Mounted the real NewGroupSheet and GroupMembers components with synthetic
  bots and an in-memory client. No pairing, live server or user data was used.
- Reproduced the broken New group swipe before the fix. Before/after UI XML and
  screenshots are `before-swipe.*`, `after-baseline-handle-swipe.*` and
  `baseline-title-swipe.*`.
- A temporary resolver logged touch delivery during diagnosis. It was removed
  before final verification; the final run loaded the repository's actual hook.
- Ran `python3 /tmp/omb-native-sheet-drag-sa2_t34c/verify-native.py` using Android
  input swipes and UI Automator reads. `native-results.json` records both cards
  passing handle/title dismissal, short-pull snap-back with draft retention,
  horizontal/upward gestures, independent scrolling to the final bot, Back,
  discarded draft reset, Save/Create, and blocked dismissal during pending saves.
- Visually inspected `new-dragging.png` and `details-dragging.png`, captured
  while the native gesture remained down. The complete before/after XML and
  screenshots are alongside them.
- The owned emulator and Metro process were stopped after verification.

Expo TypeScript, changed-file lint and whitespace checks passed. Existing
browser creation, edit and gesture checks also passed in the disposable fixture
`/tmp/omb-fixed-sheet-drag-web-uaykyodk/` (`swipe-results.json`,
`new-results.json`, `results.json`). iOS native behavior was not exercised.

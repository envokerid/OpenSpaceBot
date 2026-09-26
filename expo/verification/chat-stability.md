# Stable chat layout and live entrances — 2026-09-22

This supersedes the height-growing transcript animation in `bubble-slides.md`
and the shared typing/transcript transition in `bubble-settling.md`.

Message bubbles occupy their full height on their first layout. Only new live
arrivals in the visible, foreground conversation receive the native 260 ms
slide/fade. Initial history, REST snapshots, hidden screens, message patches,
pagination and recycled rows do not replay an entrance. Pending entrances expire
so scrolling to an older arrival cannot animate it later.

The scroll controller coalesces layout measurements, animates bottom-following
for new content, and distinguishes native programmatic momentum from reader
gestures. Native visible-content anchoring preserves reading position. Keyboard
resizing and the small typing collapse do not start competing scroll animations.
The list header remains mounted, and timestamp rows retain their geometry when
history is prepended. That last correction fixed a native pagination shift found
during this run.

Typing is tracked by turn, so a previous speaker's completion or digest cannot
hide another active turn. The indicator has a fixed footprint on appearance,
holds through short handoffs, and releases its space after the reply entrance.
Reduced Motion settles immediately. Stable cell render callbacks and comparison
of speaker identity fields avoid rebuilding historical replies for token or
busy/unread updates. Overlapping latest-page refreshes retain loaded older pages;
complete, empty and disjoint replacements remain authoritative.

## Validation

All 46 Expo tests, TypeScript, targeted lint, dependency compatibility and
Android/iOS/web exports passed. Regression tests cover live-only entrances,
hidden/resumed chats, recycled rows, native versus manual momentum, interrupted
scroll gestures, turn-scoped typing and history refresh/restore semantics.

Native tests used only the fresh Android 36 Pixel 7 AVD `omb_chat_stable`
(`emulator-5586`), paired to the isolated server/companion on ports 21858/34249.
The repository fake engine supplied gated eight-paragraph replies and two group
responders. The native run verified:

- Real multiline input and repeated keyboard Enter produce one user message.
- Long direct replies remain above the composer with the keyboard open, closed
  and reopened: reply/composer bounds were 1158/1370, 1978/2190 and 1158/1370.
- Both group members deliver their long replies; typing clears after completion.
- A new group round while reading history preserves the visible marker exactly
  at `[81,758][390,821]`.
- Loading an older page preserves the selected message exactly at
  `[578,1073][998,1136]`. The initial run exposed a 91-pixel shift, corrected by
  keeping the header and timestamp geometry stable.
- Reacting to a message (which reloads the latest page) retains the loaded older
  history. The first message remains reachable without loading it again.
- Sending with Reduced Motion resumes following; reopening existing history
  displays its settled layout.

Recordings: `direct.mp4`, `group.mp4`, `history.mp4`. UI XML, screenshots, action
scripts, fixture `send`/`wait`/`messages` outputs, source hashes and assertions are
retained at `/tmp/omb-chat-stable-vi2d067v/`; the aggregate is `acceptance.json`.
The emulator crashed during one pagination retest and was restarted using only
its disposable AVD. The final pagination run passed. Recordings establish
observed layout behavior, not a physical-device frame-rate guarantee.

The final isolated server/companion regression also passed:
`/tmp/openmausbot-verification-evidence/server-1790075167188-1113744.log.expo.json`.
The owned fixtures, Metro and emulator were stopped, and the disposable AVD was
removed. No live user data was used. iOS runtime was not exercised.

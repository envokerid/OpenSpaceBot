# Expo companion

The shared Android/iOS client is in `expo/`. Follow [the isolation rules](README.md):
no mutation may be verified against a user's live desktop, mobile app data,
paired-device registry, or saved emulator.

## Protocol and bundles

From `expo/`, after installing its npm lockfile:

```sh
npm run typecheck
npm test
npm run export
npx expo install --check
```

The tests cover URL validation, no HTTPS-to-LAN downgrade, duplicate QR fields,
captured native fixtures, arbitrary SSE chunk boundaries and early closure,
branch traversal, thread-pinned actions, pairing rejection, waiting sibling
hydration and lifecycle cancellation. Native exports compile both platform
bundles; they do not prove native device behavior.

## Real desktop API

From the repository root with Node 24+ and its dependencies installed:

```sh
node --experimental-strip-types expo/scripts/verify-server.ts
```

This calls `launchVerificationServer` from the shared `control-omb` surface,
then starts the production companion proxy on a free loopback port with an
isolated `DeviceRegistry`. There is no user-supplied server URL. It pairs the
production Expo client and verifies:

- An invalid device token and a forbidden config write are refused.
- Opening a sibling bot thread keeps desktop selection unchanged.
- A mobile send reaches the fake engine, a control-surface wait settles, and
  the same reply arrives through the mobile SSE fold.
- Repeating the same `sendId` records exactly one user message.
- Read, task rename, transcript search and file upload use the companion API.
- Edited messages retain their alternatives and active-branch switching works.
- Avatar bytes, profile updates and authenticated image reads use the same server.
- Bot permissions save through the narrow companion endpoint: Chief handover,
  additional-team acknowledgement and revocation, teammate-contact approval,
  and approval defaults inherited by new threads without changing old threads.
  Elevated/unrelated writes and approval changes during work are rejected.
- Routine create, schedule edit, pause, and deletion round-trip through the API.
- A cursor reconnect recovers the session.
- A fake engine permission-broker request reaches the mobile stream, the
  mobile client answers it, and the resumed turn settles.
- Revocation makes the next authenticated client read fail.

The script prints the retained log/evidence path. Evidence includes control
commands, bounded transcripts, and action outcomes; pairing/device tokens and
the engine capability dump are never copied to evidence. The latter remains
inside the temporary fixture and is removed on cleanup.

## Native UI acceptance

Use a newly created disposable emulator/simulator and the Expo-specific bundle
ID, not either released mobile app. Build the native development client from
`expo/`. Start Metro there with `npm start`, and launch:

```sh
node --experimental-strip-types expo/scripts/verify-server.ts --interactive
```

The script prints a fresh pairing code and local companion URL. On Android,
map **that printed port only** using `adb -s FIXTURE_SERIAL reverse tcp:PORT tcp:PORT`.
The fixture then remains attached until Ctrl-C. Enter `pair` to open a fresh
two-minute pairing window.

Check the pairing confirmation origin, roster, streamed send, thread switching
with draft/attachment isolation, approval card, disconnected recovery, Settings
round-trip, native pickers, microphone/camera permission refusal, image downloads,
share-in destination confirmation, and light/dark layout. An iOS device must
also verify local-network permission, Keychain persistence, and its share target.

### Keyboard send regression

In the disposable native fixture, type into Message and press the keyboard's
Send/Enter key without touching the composer's Send button. Confirm one user
message, an empty draft, the fake-engine reply, and scrolling to the latest
message. Repeat with a hardware Enter key; empty submissions and rapid repeated
Enter presses must not create extra turns. In the web preview, Shift+Enter
should insert a newline and Enter should submit (outside IME composition).

Verified on 2026-09-22 with the fresh Android 36 AVD `omb_enter`
(`emulator-5692`): on-screen Send and hardware Enter each submitted one turn;
Shift+Enter preserved a newline; repeated and empty Enter presses created no
extra messages. Both drafts cleared and fake replies appeared. UI captures,
command record, `wait`/`messages` outputs and assertions are in
`/tmp/omb-enter-xyzgerde/`. The isolated server/companion checks passed with
evidence at
`/tmp/openmausbot-verification-evidence/server-1790052273596-24504.log.expo.json`.
The owned server, Metro process and emulator were stopped. iOS and web keyboard
behavior were not exercised in this run.

### Typing indicator regression

Hold a fake engine turn open after emitting reasoning and partial answer deltas.
The chat must show a fixed-size three-dot bubble with an accessible typing
label, without partial reply/reasoning text. Emit a much larger delta and
confirm the indicator's bounds do not change. Release the completed assistant
message and settle the turn: the full Markdown message appears once and the
typing indicator disappears. With reduced motion enabled, the dots stay still.

Verified on 2026-09-22 with a fresh Android 36 AVD `omb_typing`
(`emulator-5702`) and a gated wrapper around the repository fake engine.
The indicator stayed at `[81,975][176,1028]` before and after 500 additional
text fragments. Cropped screenshot comparisons confirmed moving dots normally
and static dots with reduced motion. The final message appeared only after
the completion gate was released. TypeScript, lint and all 19 Expo tests passed.

Native captures, wrapper, command record, `wait`/`messages` and assertions:
`/tmp/omb-typing-dwgzhx1c/`. Server/companion evidence:
`/tmp/openmausbot-verification-evidence/server-1790053101008-73732.log.expo.json`.
All owned fixture processes were stopped. iOS runtime was not exercised.

### Hidden digest typing regression

Hold the fake engine's result frame after delivering its complete assistant
message. The reply must appear and the typing indicator must disappear even
while the server remains busy. Release completion and the hidden digest;
neither may add a loader or change the reply's bounds. Start another turn and
confirm its normal typing indicator returns.

Verified on 2026-09-22 with the fresh Android 36 AVD `omb_digest_ui`
(`emulator-5722`). The final reply was visible with no typing indicator while
the fixture API still reported `busy: true`. Digest settlement preserved the
reply bounds exactly; the next turn showed typing and settled without a second
loader. TypeScript, lint and all 23 Expo tests passed, including completion,
reasoning cleanup, delayed digest patches, subsequent turns and snapshot recovery.

Native captures, gated fake-engine wrapper, command record, `wait`/`messages`
outputs and assertions: `/tmp/omb-digest-ui-9s0ukgdf/`. Server/companion evidence:
`/tmp/openmausbot-verification-evidence/server-1790054378233-109000.log.expo.json`.
The owned fixture server, Metro process and emulator were stopped. iOS runtime
was not exercised.

### Bubble entrance regression

Record a new sent message and a gated multiline bot reply in the disposable
Android fixture. The user bubble should enter from the right and the bot bubble
from the left, with a short spring bounce. The complete text and measured
background must move together at their final size; the typing bubble must not
grow into the answer. Existing history, pagination, patches and recycled rows
should not replay entrances. Reduced motion should show the completed bubble
without movement.

Verified on 2026-09-22 with the fresh Android 36 AVD `omb_bubble_jump`
(`emulator-5732`). Frame-by-frame native video review confirmed both entrance
directions, spring overshoot, and complete multiline text in the first visible
reply frame. After the reply clears the viewport edge, its width stays at 440px
in the half-resolution recording and height at 164–165px (rasterization).
The user bubble stays 422px wide. Hidden digest settlement adds no loader.
TypeScript, lint and all 26 Expo tests passed; regression tests cover initial
history, pagination, patches, remounts, branches and the first new message.
Reduced-motion support is implemented but was not exercised in this native run.

Video, contact sheets, frame measurements, fake-engine wrapper, command record
and `wait`/`messages` outputs: `/tmp/omb-bubble-jump-8my8ggkq/`.
Server/companion evidence:
`/tmp/openmausbot-verification-evidence/server-1790055540581-197321.log.expo.json`.
The owned server, Metro process and emulator were stopped. iOS runtime was not
exercised.

### Chat scrolling regression

Use the same disposable native fixture with a conversation longer than the
screen and a fake reply streamed in multiple paragraphs. Verify:

- Send while reading earlier messages: the sent message becomes visible and
  following resumes before the server responds.
- Let a long reply stream: the typing indicator stays visible and fixed in
  size. Once the completed message arrives, its newest text stays visible.
- Open and close the keyboard at the bottom: the latest reply remains above
  the composer.
- Scroll up deliberately, then trigger another turn through the fixture's
  explicit `control-omb send --url …`: the older text keeps its position while
  the reply streams and settles.
- Reopen the thread: it opens at the latest reply. Search-result navigation
  and Load earlier messages should continue to preserve history browsing.

On 2026-09-22, the send, streaming, keyboard-open, history-preservation and
thread-reopen checks passed on a fresh Pixel 7 Android 36 AVD
(`omb_chat_scroll`, `emulator-5584`). The fake CLI wrapper emitted a 14-paragraph
reply in half-second chunks. UI XML confirmed identical visible paragraph
bounds before/after an incoming turn while reading history; with the keyboard
open, the reply's final marker ended at y=1164 and the composer began at y=1367.
Screenshots during sending, streaming and after settlement were inspected.
Search-result navigation and history pagination were not exercised in this run.

Action/state evidence, UI XML, screenshots, fake-engine wrapper and command
record: `/tmp/omb-scroll-lurjx5hn/`. The server/companion checks also passed;
their retained evidence is
`/tmp/openmausbot-verification-evidence/server-1790051021847-1011645.log.expo.json`.
The fixture and its emulator were stopped after verification. This does not
prove iOS native scrolling behavior.

### Manual scroll release regression

With a long settled reply, drag down slightly to leave a small gap from the
bottom (inside the former 140dp snap zone). Releasing the drag must preserve
that position. Another completed reply must also leave that position alone.
Then send through the native composer: the sent message and typing indicator
must come into view, followed by the completed reply. Open the keyboard and
confirm the latest text remains above the composer.

Verified on 2026-09-22 with the fresh Android 36 AVD `omb_scroll_release`
(`emulator-5742`). A slow 180px drag moved the visible paragraph down 155px;
its bounds remained exactly `[81,1309][882,1561]` after release, an idle capture,
and a second completed reply. Sending through the composer resumed following.
The third reply's final marker ended at y=1973 with the composer at y=2187;
opening the keyboard moved them to y=1153 and y=1367 respectively. Captures
confirmed no leftover typing indicator. TypeScript, lint and all 30 Expo tests
passed, including small manual gaps, momentum intent, keyboard resize and
explicit send resumption.

UI captures, assertions, command record, wrapper and `wait`/`messages` outputs:
`/tmp/omb-scroll-release-ay26lkhg/`. Server/companion evidence:
`/tmp/openmausbot-verification-evidence/server-1790058735936-322064.log.expo.json`.
The owned fixture, Metro process and emulator were stopped. iOS overscroll and
native momentum were not exercised; the native gesture check used a slow drag.

## Verified on 2026-09-21

- TypeScript, lint, all 16 protocol/state tests and Expo dependency compatibility pass.
- Android and iOS Hermes bundles and the web preview export successfully.
- The generated Android development client builds successfully with SDK 57 /
  React Native 0.86.3 on Linux (`:app:assembleDebug`, x86_64).
- A fresh Android 36 emulator paired through the real companion proxy, loaded
  the roster, sent `Expo emulator message`, and displayed the fake engine reply.
- Switching to a sibling showed an empty composer; switching back restored
  `Keep this draft`. Restarting the app restored its secure pairing.
- Android ACTION_SEND text required destination selection and Add to draft;
  `Shared_fixture_draft` appeared in the composer without being sent.
- Refusing the microphone permission displayed a recoverable explanation.

The final API evidence is
`/tmp/openmausbot-verification-evidence/server-1789998705953-122616.log.expo.json`.
Android action/state evidence, control-surface transcript, UI XML and screenshots
are in that directory under `expo-android-*`. Build/export logs are
`/tmp/omb-expo-build-final.log` and `/tmp/omb-expo-export-final.log`.

These checks do not prove iOS native compilation/runtime, physical LAN or
Tailscale reachability, cloud provider viewer behavior, camera scanning,
photo/document picker behavior, or speech recognition quality. The later Android UI comparison also tapped Allow and submitted a two-question
answer through the actual permission broker. See the [screen comparison record](../../expo/verification/ui-parity.md)
for screenshots, additional GUI workflows and remaining native parity differences.

### Idle VM preview regression

```sh
node --experimental-strip-types expo/scripts/verify-computer.ts
```

This launches the standard isolated harness and a real companion with a fresh
pairing registry. Only Docker is replaced with an owned fixture executable;
other container runtimes are shadowed so no real daemon is contacted. The
fixture returns a known PNG through the real VM screenshot route. Checks cover
an idle VM, Auto discovery after desktop discovery, a phone-selected sibling
without changing desktop selection, invalid threads, capture failure/recovery,
and rejection of host screenshots and VM lifecycle operations. Action/state
evidence is saved beside the fixture's server log.

Use `--interactive` for a disposable native emulator; enter `pair` to refresh
the pairing code. Open the bot's computer with no active turn: the PNG must
render and the spinner must disappear. Create/remove `fail` in the printed
fixture scratch directory to exercise the preview error and Retry button.
Leaving the computer screen or backgrounding the app must stop capture polling.
The fixture must be stopped with Ctrl-C; it never uses the user's app data.

Verified on 2026-09-22 using the fresh Android 36 AVD `omb_vm_preview`
(`emulator-5762`). Opening Watch computer on an idle bot displayed the fixture
PNG and removed the spinner. A simulated capture failure kept the last image
visible and showed Retry preview; removing the failure recovered automatically.
Closing the view stopped polling. Screenshots, UI XML, commands and assertions:
`/tmp/omb-vm-native-uAa3Rd/`. Real server/companion evidence:
`/tmp/openmausbot-verification-evidence/server-1790060280771-425840.log.computer.json`.
All 33 Expo tests and 129 targeted route/auth tests passed, along with TypeScript,
lint and Android/iOS/web exports. The container process and image were simulated;
this does not prove a real Docker desktop or iOS runtime. The owned fixture,
Metro process and emulator were stopped after verification.

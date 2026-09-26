# Recorded chat acceptance — 2026-09-22

## Reproduced and fixed

- Sending disabled the focused input and dismissed Android's keyboard. The
  composer now remains editable; its send lock still prevents duplicate sends.
- Send completion overwrote edits made while awaiting acknowledgement. Only
  the submitted, unchanged draft is cleared. Failed sends retain unchanged
  payloads with their receipt ID for explicit retry; edited payloads get a new ID.
- A failed transcript refresh could restore an already accepted message as an
  unsent draft. Refresh errors no longer reverse successful send acceptance.
- Long bot-name placeholders wrapped into another line, then shrank when the
  busy hint appeared. Short hints and explicit line height keep the empty input
  at 48 points in every tested state.
- The typing bubble retained its height during its exit after the answer arrived.
  The completed reply and removal of typing space now occur together.
- Editing rebuilt the message list and reparsed unchanged bubbles. Transcript
  derivation and bubbles are memoized; native text editing stays local, with
  brief debounced draft persistence and synchronous text capture for Send.
  Explicit updates still handle clearing, commands and dictation. See the
  [React Native direct-manipulation reference](https://reactnative.dev/docs/0.79/the-new-architecture/direct-manipulation-new-architecture).

## Isolated native fixture

The standard `expo/scripts/verify-server.ts --interactive` recipe launched a
disposable fake-engine server and production companion. A newly created Pixel 7
Android 36 AVD (`omb_chat_polish`, `emulator-5586`) ran the real Expo app, with
Metro on 8120. No live app, saved emulator or user data was used.

The fake CLI wrapper gated complete answers and result frames. A local relay
around this fixture's companion delayed one send acknowledgement by five
seconds and rejected selected sends once with HTTP 503. It recorded fixture
payloads and receipt IDs, never credentials. The existing fixture's forbidden
settings check was updated to assert HTTP 403 rather than an outdated error string.

Action scripts, timestamped actions, screenshots, UI XML, bounded transcripts,
wait results, relay, fake engine, and acceptance assertions:
`/tmp/omb-chat-polish-oqs22pdl/`.

Server/companion evidence:
`/tmp/openmausbot-verification-evidence/server-1790062650013-568258.log.expo.json`.

## Recorded results

- `before-send.mp4`: baseline Send dismisses the keyboard and moves the composer.
- `chat-after.mp4`: long draft, editing during a delayed send, failure/retry,
  double taps, keyboard transitions and restored draft after switching bots.
- `groups-after.mp4`: reading history during an incoming reply, group retry with
  repeated keyboard sends, typing-to-reply transition, and keyboard open/close.
- `multiline.mp4`: Shift+Enter inserts a real newline; the two-line message
  reaches the group unchanged, with Reduced Motion enabled during send/reply.

Frame contact sheets were inspected. All ten checks in `acceptance.json` passed.
Server transcripts contain one message per accepted payload. Button and keyboard
retries reuse their original receipt IDs. The visible history marker retained
exact bounds before and after an incoming reply. The empty group composer
measured 126 physical pixels (48 dp) before, during and after typing, with the
keyboard both open and closed; no typing indicator remained after completion.

One oversized `adb input text` command lost its trailing characters because
Android's InputDispatcher discarded stale injected events. This also happened
with local input state and is not counted as a confirmed app defect. Subsequent
tests used short keystroke bursts and verified complete text against the native
field and server transcript.

TypeScript, targeted lint, all 38 Expo tests, and Android/iOS production exports
passed. All owned servers, Metro, relay and emulator were stopped afterward.
The videos verify Android with the emulator's keyboard and a fake engine. They
do not establish native iOS behavior, physical-device frame rates, third-party
IME behavior, or every attachment/dictation path.

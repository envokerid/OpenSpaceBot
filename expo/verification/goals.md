# Expo group goals

## Implementation

The bottom-left More menu offers Goal for non-DM groups. It inserts `/goal ` at
the start of the current draft, preserving text and attachments. The editable
prefix is the sole source of goal mode; removing it restores normal chat.
The composer itself animates blue–purple and says “Writing a goal” inside the
input, with no separate banner. Typed `/goal` works too. Bare commands cannot
send without content or attachments. The prefix is stripped before calling the
existing `mode: "goal"` API. Failures preserve the prefix and retry receipt.

Only the detailed goal-run receipt appears in the transcript, spanning its full
content width with the standard bubble padding, animated blue–purple gradient
and white text. Original user goal prompts are hidden by the mobile transcript
projection, not deleted from stored history or exports. There are no
borders, folded corners or animated icons. A compact Goal label identifies the
message; run receipts retain their status, coordinator, turn budget and latest
detail. The background crossfades over eight seconds without changing layout.
Motion respects reduced-motion preferences and app backgrounding.

## Verification — 2026-09-22

- `cd expo && npm test`: 53 passing, including prefix insertion/removal/parsing,
  mode-specific payloads, hidden duplicate prompts and in-flight draft changes.
- `cd expo && npm run typecheck`: passed.
- Targeted `oxlint --deny-warnings`: passed.
- `cd expo && npm run export`: web, iOS and Android bundles built.
- `node --experimental-strip-types expo/scripts/verify-goals.ts`: passed against
  its own isolated fake-engine server and paired companion. Verified actual
  goal activation, durable prompt mode, completed receipt, SSE status update,
  idempotent retry and subsequent normal chat. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790080524596-1329958.log.expo-goals.json`.
- Disposable React Native Web fixture mounted real Chat/MessageBubble components
  at 390×844 in system/light and midnight themes. Verified More → Goal, failed
  send/retry, automatic reset, cancellation, every run status and no Goal menu
  item in DMs/direct bot chats. After the gradient redesign, sampled gradient
  opacity to verify motion and live reduced-motion changes. Asserted standard
  bubble padding/radius and zero borders. No browser runtime errors.
  Fixture and screenshots: `/tmp/omb-group-header-SmCeu0/check-goals.cjs`,
  `goal-composer-{system,midnight}.png`, `goal-working-{system,midnight}.png`,
  `goal-completed-{system,midnight}.png` in the same directory.
- Current composer/full-width checks:
  `/tmp/omb-group-header-SmCeu0/check-goal-input.cjs`. Passed in light and midnight:
  actual editable `/goal ` prefix, no banner, prefix-only Send disabled, prefix
  removal restores chat, repeated menu selection does not duplicate it,
  animation/reduced motion, failed send/retry, stripped API text, one visible
  goal card spanning 358px of a 390px viewport (16px gutters), normal messages
  after cancellation, and no goal interpretation in direct bots/DMs.
  Screenshots: `goal-input-{system,midnight}.png` and
  `goal-full-width-{system,midnight}.png` in that directory.

No live app/data was mutated. Native device runtime/keyboard behavior remains
unverified; the native bundles were compiled, not run on hardware.

## Backspace regression

ComposerInput now uses a locally controlled `value` on native as well as web,
letting React Native synchronize keyboard updates with its event counter. It
no longer mixes an unchanged native `defaultValue` with imperative text writes
for command insertion and draft resets. Slash suggestions open when typing a
command, not while backspacing through `/goal` and shifting the composer.

`/tmp/omb-group-header-SmCeu0/check-goal-backspace.cjs` drives real keyboard
Backspace presses (not whole-field replacement) in the isolated web fixture.
Both themes passed deletion through `/goal`, `/goa`, `/go`, `/g`, `/`, empty;
focus/caret retention; rapid deletion; removing only the prefix while keeping
the description; normal sending afterward; and fresh slash suggestions.
The existing goal-input fixture also passed. Typecheck, 53 tests, targeted lint
and all three platform exports passed. This verifies browser keyboard behavior
and compilation, not physical-device native keyboard behavior.

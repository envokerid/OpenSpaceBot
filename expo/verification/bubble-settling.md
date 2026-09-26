# Disappearing typing bubbles — 2026-09-22

The chat footer keeps `LiveBubble` mounted and changes its `visible` prop.
Previously, conditional mounting bypassed `SpeechBubble`'s exit transition.
The shared bubble transition now collapses occupied height, translation and
opacity together over 360 ms with cubic ease-out. This lets following messages
settle into the released space. Reduced Motion still applies the final state
immediately. This change does not delay transcript replacement during branch
or conversation switches.

Validation used a fresh Android 36 Pixel 7 AVD (`omb_bubble_settle`, serial 5586)
and the isolated server/companion fixture on ports 21813/43689. No live app data
was used. A gated fake engine supplied a long conversation and controllable
typing completion.

- Recorded an interrupted turn and a successful completion with no final text.
  Both removed the typing indicator without a residual spacer. The latter moved
  the last user message down 129 native pixels as space was released.
- Video frame samples contained multiple intermediate transcript positions.
  The emulator recording averaged about 20 fps, so it does not establish 60 fps
  playback on physical hardware.
- While reading history, another turn started and finished with Reduced Motion
  enabled. The visible marker retained exactly `[81,1990][390,2053]` bounds.
- Expo TypeScript, targeted lint, all 38 tests, and Android/iOS exports passed.
  The real server/companion verification also passed.

Recordings (`complete.mp4`, `settle.mp4`), frame positions, UI XML, action scripts,
and control-surface `send`/`wait`/`messages` results are retained at
`/tmp/omb-bubble-settle-14o_zs3h/`. Server evidence:
`/tmp/openmausbot-verification-evidence/server-1790068331852-821804.log.expo.json`.
The owned fixture, Metro and emulator were stopped and the disposable AVD removed.
iOS runtime was not exercised.

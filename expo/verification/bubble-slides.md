# Bubble slides — 2026-09-22

New message bubbles use a 260 ms eased horizontal slide from their respective
side, with opacity changing alongside it. The former spring and vertical bounce
are removed. Loaded history still uses the existing entrance registry to avoid
replaying animations on pagination or remount.

The typing bubble stays mounted during its 200 ms exit, then removes its layout
space. A new typing event during exit reverses the transition from its current
position. The footer keys it by conversation to avoid carrying typing presence
between conversations. Exiting content is unavailable to accessibility and
pointer interaction; reduced motion immediately applies the target state.

Validation:

- Expo TypeScript and targeted lint passed; all 33 Expo tests passed.
- The isolated server/companion verification passed. Retained evidence:
  `/tmp/openmausbot-verification-evidence/server-1790060612121-453474.log.expo.json`.
- A disposable browser context rendered the real `SpeechBubble` and `LiveBubble`
  components through React Native Web. Transform samples verified entrance from
  both sides, typing exit before removal, zero vertical movement, stationary
  history, interrupted exit reversal, and reduced-motion behavior. No page errors
  occurred. Evidence: `/tmp/omb-bubble-slide-check/results.json` and `settled.png`.

The browser fixture contains synthetic content only and uses no saved profile
or app data. Native Android/iOS animation playback was not exercised in this run.
Ordinary message removal through switching branches is not given an exit delay;
the disappearing typing bubble is the retained exit transition.

## Synchronized feed movement follow-up

The first implementation reserved a new bubble's full height before its slide
started. `SpeechBubble` now uses the same animated progress for occupied height,
horizontal translation, and opacity. The existing follow-scroll hook tracks that
growing layout, so the feed moves while the bubble is appearing. Text and its
background are measured in an absolutely positioned inner view at their final
size; they are never stretched or constrained by the animated spacer. Layout
animation uses the JS driver because React Native's native driver cannot animate
height. Reduced motion still settles immediately.

TypeScript, targeted lint, and all 38 Expo tests passed. An isolated component
fixture rendered the real FlatList, `useChatScroll`, entrance registry, and
`SpeechBubble`. Frame samples for short and taller-than-viewport replies verify
multiple scroll offsets during partial opacity, identical progress for space and
opacity, unchanged text height, and immediate reduced-motion settling. Evidence:
`/tmp/omb-bubble-sync-check/final-assertions.json`. Browser mouse-wheel scrolling
does not exercise the native drag callbacks; reader-intent checks remain covered
by the existing scroll-position tests.

A fresh Pixel 7 Android 36 emulator (`omb_bubble_sync_20260922`, serial 5752)
paired only with an isolated server/companion fixture on ports 22155/45217.
Synthetic sends and their `wait`/`messages` results are retained in
`/tmp/omb-bubble-sync-check/control.json`. The first recording exposed constrained
text during height growth, fixed by the separate absolute inner view. The final
recording and accessibility dump (`native-final.mp4`, `native-final-after.xml`)
confirm intact text and final layout. The emulator recording delivered too few
intermediate frames to establish native animation smoothness; the timing
assertions above are from the web renderer. iOS was not exercised.

The real companion fixture passed, with evidence at
`/tmp/openmausbot-verification-evidence/server-1790066714639-710366.log.expo.json`.
The owned fixture, Metro, static server, and disposable emulator were stopped,
and only the newly created AVD was removed.

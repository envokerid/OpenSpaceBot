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

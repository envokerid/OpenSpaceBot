# Full-height mobile layout

The root SafeAreaView previously padded the entire conversation above and
below its scroll viewport. Messages stopped at the system bars even though
the floating header and composer were translucent.

The keyboard-avoiding container now occupies the full window. Chat and roster
apply system insets to their controls; chat messages can scroll to both screen
edges. Other screens retain their safe-area padding. Bottom control padding is
removed while the keyboard is visible, and the roster uses the root keyboard
avoidance instead of a second nested container.

## Verification on 2026-09-22

Follow `docs/verification/expo-companion.md` and launch:

```sh
node --experimental-strip-types expo/scripts/verify-server.ts --interactive
```

Use a fresh disposable emulator, pair only with that fixture, and create a bot
with a long synthetic conversation through `control-omb` with its explicit URL.
Check the final message, scroll into the middle, open the keyboard and enter an
unsent draft, then close the keyboard. Inspect screenshots and native UI bounds.

Verified with the current development APK and Metro bundle on a fresh Pixel 7
Android 36 AVD (`omb_full_height`, `emulator-5576`). The scrolled reply spans
`[42,0][922,2400]` on the 1080×2400 screen. The composer moves from
`[310,2187][781,2316]` to `[310,1367][781,1496]` above the keyboard, then returns
to its original bounds with the draft intact. Screenshots confirm messages
continue behind both system bars. The final reply remains reachable.

TypeScript, lint, all 30 Expo tests and the isolated server recipe passed.
Native screenshots, XML, assertions and control transcripts are retained in
`/tmp/omb-full-height-lhozgvqo/`. Server evidence is at
`/tmp/openmausbot-verification-evidence/server-1790059315212-356460.log.expo.json`.
iOS runtime and landscape were not exercised.

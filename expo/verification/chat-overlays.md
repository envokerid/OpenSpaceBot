# Chat overlay scrolling — 2026-09-22

The transcript fills the chat viewport underneath both the header and the
composer. Both control areas are absolute overlays. Their gradients start at
the top and bottom edges and cover the full width, including the spaces around
the buttons. A concurrent workspace change moved system safe-area padding into
the controls themselves; the final follow-up below checks that integration.

`onLayout` measures each overlay. Those heights provide transcript padding and
scroll-indicator insets so the first and last messages can rest clear of the
controls. They also explicitly size the SVG fades: a percentage-sized SVG
failed to follow a growing multiline composer during native verification.
Errors, queued messages, attachments and the slash-command panel are included
in the footer measurement. The group title has its own small surface so message
text passing behind it cannot obscure its label.

Checks passed:

- `cd expo && npm run typecheck`
- `cd expo && npm test`: 30 tests passed, including the current scroll-follow tests.
- `node_modules/.bin/oxlint expo/src/Chat.tsx`
- The real Expo server/companion verification and native Android checks below.

Native verification used a newly created Pixel 7 Android 36 AVD named
`omb_edge_scroll_20260922`, serial `emulator-5752`, the existing development APK,
and an owned Metro instance on port 8147. The app paired only with the isolated
fixture from `node --experimental-strip-types expo/scripts/verify-server.ts
--interactive`, using fixture server port 20250 and companion port 35907.
The fixture uses temporary data and fake providers. No live app, pairing
registry, or saved user emulator was used for verification.

Synthetic long bot and group conversations were created using the documented
control surface with the explicit fixture URL. Evidence includes the exact
commands and resulting `wait`/`messages` output in
`/tmp/omb-edge-scroll-evidence/control.json` and `group-control.json`.

Screenshots and accessibility dumps in the same directory cover:

- `final-bottom`: the final reply is above the composer.
- `final-scrolled`: the transcript extends behind both overlays.
- `final-keyboard`: multiline composer, keyboard open, continuous footer fade.
- `group-bottom`: group conversation with the larger header.
- `group-dark-final`: dark group conversation and readable group title.

`assertions.json` records measured bounds. With the keyboard closed, the
transcript spans y=136–2337 while the header buttons occupy y=147–273 and Send
occupies y=2190–2316. With the keyboard open it spans y=136–1517, and Send moves
to y=1371–1497. Thus the list viewport continues underneath both controls.
At the bottom of the bot conversation, the final reply ends at y=1921, above
the composer beginning at y=2134. Captures were also visually inspected.

The development client's floating Tools button is visible in these captures;
it is not part of the production chat header. iOS native runtime behavior was
not exercised. Queue/attachment height combinations were not separately
walked through on the device.

Cleanup stopped the owned Metro process, emulator and interactive fixture,
then removed only the newly created AVD. The fixture's final result was
`passed`; its retained evidence is
`/tmp/openmausbot-verification-evidence/server-1790058425024-308476.log.expo.json`
and its server log is the adjacent `.log` file.

## Screen-edge follow-up

A fresh instance of the same disposable AVD checked the integrated safe-area
layout against a second isolated fixture (server 20098, companion 41661).
`control-edge.json` retains the mapped commands, `wait`, and `messages` for
the synthetic Screen Edge Check bot. `edge-bottom.png` and its accessibility
dump show the transcript spanning the full display, y=0–2400, with controls
inside the system bars. The final reply ends at y=1921, above the composer
at y=2134. `edge-keyboard-scrolled.png` and its dump show the transcript
spanning y=0–1517 with the keyboard open, a multiline draft, and Send at
y=1370–1496. Both captures were visually inspected; text passes behind the
controls and the gradients extend to the viewport edges.

TypeScript and Chat lint passed again. The fixture finished with `passed`;
its evidence is
`/tmp/openmausbot-verification-evidence/server-1790059386783-366582.log.expo.json`.
The second owned Metro, fixture and disposable emulator were also stopped.

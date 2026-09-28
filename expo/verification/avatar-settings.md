# Expo avatar settings

Open a bot's settings from its chat header, then use **Avatar**. The phone now
shares the desktop's eleven colors, complete body catalog, four crop modes and
reset defaults. Expressions animate automatically; there is no emotion picker. Appearance changes save immediately.
Uploaded/generated images remain available when switching back to the mascot;
**Remove custom image** deletes the profile reference and selects the mascot.
Previous expression selections do not pin Expo avatars; activity and bot identity
choose the animation automatically.

**Generate an avatar** offers OpenAI, Grok (xAI), and custom OpenAI-compatible
connections, write-only key replacement/removal, custom endpoint/model entry,
and optional art direction. Generation saves the edited identity first and uses
the returned avatar crop. Custom connections can run without a key. Provider
changes require the existing desktop **Manage workspace settings** grant or a
hosted administrator session. Organization icons appear on managed desktops when
the settings bridge is available and granted; they upload as ordinary portable
avatar attachments.

An updated server is required: the strict profile endpoint now accepts validated
`color` and `mascotExpression` fields. Unknown fields and permission settings
remain rejected. No companion route or authorization policy was broadened.

## Automated verification

From the repository root:

```sh
npm test --prefix expo
npm run typecheck --prefix expo
npm run typecheck
npm exec -- vitest run server/bot-profile.test.ts server/bot-avatar.test.ts server/avatar-image.test.ts src/components/BotProfileAvatarCard.test.ts src/components/Avatar.test.ts src/components/BotIdentityAvatars.test.ts src/lib/mascot.test.ts
node --experimental-strip-types expo/scripts/verify-avatar-settings.ts
npm run export --prefix expo
```

The headless fixture uses `launchVerificationServer` from the shared control
surface. It owns a temporary home/data directory, fake engine, paired companion
and local fake Images API. It accepts no live URL and cleans up its own servers.
It tests every picker value, upload/read/removal/reset, image-provider grant
checks, secret redaction, prompt-free generation using edited identity,
custom-crop preservation and keyless generation after key removal. JSON evidence
is written beside the printed fixture log. No real image provider is contacted.

Visual verification is left to the user per AGENTS.md. No UI fixture, emulator,
browser or screenshot check was launched. On a phone, check swatch selection,
scrolling, light/dark appearance, photo-library cancellation, and keyboard access
to connection fields. Native photo-picker interaction, organization icon display
and real provider generation still require manual acceptance.

## Picker responsiveness

Selections now update the local preview synchronously. A 200 ms trailing debounce
combines rapid taps, and each bot has one serialized writer per connection. The
picker stays enabled during ordinary appearance saves. Incoming stream updates
cannot replace fields in the pending draft. Failures retain the latest selections
and expose **Retry saving avatar**. Closing flushes the pending batch; reopening
uses the same writer. Upload and generation flush appearance changes first.

Avatar saves no longer call `session.refresh()` (which downloads every bot and
selected conversation pages). The confirmed save response updates the shared bot state immediately, and the
existing bot event stream keeps other clients synchronized.
Model and voice discovery no longer disables the picker on entry.

The renderer memoizes thumbnail appearance, parses each silhouette only when its
body changes, and animates native SVG transforms/face geometry. It no longer
rebuilds and parses complete SVG documents on each animation frame. Static swatches
also avoid the extra state update previously performed by the motion effect.

`expo/tests/avatarEditor.test.ts` covers debouncing, immediate previews, slow
responses, ordering, failed saves/retry, close/reopen, no-op selections and bot/
connection isolation. The headless fixture additionally exercises 60 rapid color
taps plus body/expression/crop changes: **one profile write, zero fleet reloads**,
with the final appearance committed from the confirmed companion response.

Verified 2026-09-25: all 70 Expo tests, Expo type checking, targeted lint and
Android/iOS/web exports passed. Fixture evidence:
`/tmp/openmausbot-verification-evidence/server-1790336595841-1499452.log.expo-avatars.json`.
No device frame-rate claim is made; native responsiveness and visual rendering
remain for the user's manual verification under the repository instructions.


## Confirmed save synchronization

The production editor now commits successful avatar responses to the shared
session used by chat, roster and other screens. It no longer depends on native
SSE delivering the matching event before those screens update. Only avatar fields
are merged; newer messages, task state and unrelated profile edits are preserved.
Receipts join the session's refresh journal, so an older refresh already in flight
cannot roll the avatar back. Failed writes leave the shared bot unchanged and
retain the editor draft for retry. Generated images use the same receipt path.

The headless fixture also opens a session without starting an event stream, uses
the production cached editor, and checks the shared bot immediately after save.
An independent server read verifies the same appearance was persisted. The tests
cover this path, failure handling and a concurrent stale refresh.

Native SVG gradient offsets use numeric values (`0`, `0.55`, `1`), avoiding the
library's rejection of the string `".55"`.

Verified 2026-09-25: 73 Expo tests passed. Isolated fixture evidence:
`/tmp/openmausbot-verification-evidence/server-1790337989841-1520822.log.expo-avatars.json`.


## Automatic expressions

Expo no longer shows an expression picker. Mascots automatically cycle through
faces using the desktop's shared expression pools and hold times, blink cadence,
spring transitions and body-motion transforms. Roster avatars, chat headers and
the settings preview animate at their normal sizes. The old 60-pixel animation
cutoff has been removed. Saved expression overrides are ignored in Expo; bot
activity and the desktop's automatic identity rules determine its mood.

The native renderer retains cached silhouette artwork and uses one shared frame
timer. Reduced motion and backgrounding pause animation. Static body-picker
thumbnails and historical message speaker icons remain still; a hidden chat
header also stops animating. No server setting is mutated to change emotions.

Automated animation tests advance a deterministic clock across all 39 desktop
states, checking face changes without input, blink behavior and body transforms.
They also check that old manual selections cannot override automatic mobile
activity. Native visual verification remains with the user.

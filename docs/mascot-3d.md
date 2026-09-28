# The Maus orb

The default mascot in the desktop and Expo apps is a procedural Three.js orb
based on `graphics/avatar.mp4`: a luminous sphere with capsule eyes. White
bodies use dark eyes for contrast. `shared/orb-scene.ts` owns the geometry and materials;
`shared/orb-mascot.ts` owns the expressions and motion. No model or texture
assets are downloaded at runtime.

The stored `cursor` body ID now selects the orb in these two apps. This keeps
existing profiles and backups compatible without a server migration. Other
body IDs keep their original artwork, and uploaded profile images still take
precedence. The separate Swift and Kotlin applications are unchanged.

## Appearance

In a bot's Avatar settings choose **Mascot**, then **Orb** in the body picker.
The eleven color swatches recolor the orb immediately through the usual
profile save path. **Reset mascot** selects white and clears
the saved expression override, retaining any uploaded image for later reuse.

Desktop allows selecting a resting expression, including celebration and
alert, and **Follow bot activity** clears that override. Expo has a local
**Preview emotions** control; **Automatic** returns to live activity. Mobile
previews do not change the bot's saved state. Both settings panels also offer
**Try a situation** with typing, teammate waits, new replies and completion.
Desktop **Live activity** and Expo **Automatic** leave preview mode.

Automatic activity uses the existing presentation state: working animates a
focused bob, approval waits listen, unread replies notify, and failures alert.
Research profiles glance around; idle breathes and blinks. The scene also
supports the app's full existing emotion vocabulary, including sleeping,
curious, thinking, happy and celebration. Desktop pointer gaze and imperative
blink/spin reactions remain available.

## Automatic animation triggers

The body hovers above a stationary, soft elliptical shadow. Higher hover makes
that shadow wider and lighter; lower hover brings it into focus. The SVG
fallback shares the same floating, breathing, blinking and gaze animation,
including a separated ground shadow. Reduced motion preserves the
floating pose without bobbing or pulsing.

| Trigger | Performance | Duration |
| --- | --- | --- |
| Assistant text deltas | Focused eyes tracking a line, bob and three pulsing dots | While streaming |
| Assistant reasoning deltas | Uneven thinking eyes and a slow head tilt | While reasoning |
| `waitingForTeammates` | Glances between teammates, with orbiting dots | Until the dependency clears |
| Approval / `waiting-on-you` | Attentive eyes and a listening pulse | Until answered |
| A newly received human message | Smiling eyes and an excited bounce | Up to 1.8 seconds |
| A newly received peer message | Acknowledging nod | Up to 1.2 seconds |
| A newly completed assistant reply | Celebration bounce | Up to 1.8 seconds |
| A pending search/browser tool | Searching gaze | While active |
| Failed tool / unavailable agent | Alert eyes | Until superseded |

`shared/mascot-triggers.ts` defines the finite reaction triggers;
`shared/mascot-state.ts` classifies continuous signals. The shared React hook
expires reactions even without another server event. Approvals, failures,
streaming and teammate waits interrupt reactions. Live activity overrides a
saved resting expression; explicit preview mode bypasses live triggers.

Each controller is scoped to its bot and selected thread. It baselines the
initial transcript and suppresses replay when loading history, switching
branches/threads, disabling animation, or applying duplicate message patches.
Queued messages are not treated as a newly received human reply. No animation
trigger sends a chat message, starts a bot, or changes server state.

## Rendering and lifecycle

- Desktop lazy-loads Three.js and shares one 256px offscreen WebGL2 renderer
  across avatar canvases. Offscreen and hidden-page animation stops. Static
  portraits render only after a change. Sidebar bots and group member icons
  animate continuously, including when idle. Context loss reveals an animated vector fallback;
  restoration redraws it. The last unmount disposes the GPU resources.
- Expo uses SDK 57 `expo-gl` with the same Three.js scene, without DOM globals
  or texture loaders. A bound context facade handles Expo GL2’s prototype
  inheritance without changing global WebGL constructors. Native work is capped at four roster and two hero GL
  surfaces. Small icons (under 28px), static picker thumbnails, queued avatars,
  and unavailable GL implementations use a matching vector portrait. Home
  avatars keep animating even when small or waiting for a GL slot; only explicit
  static previews stay still. Vector avatars share a 30fps clock that stops
  when no viewers need it. Queued
  avatars acquire a surface when one becomes free. Backgrounding releases the
  surfaces; returning recreates them.
- Both honor reduced motion with still expressions. Native animation runs at
  30fps, with geometry updated in place and disposed on unmount.

After pulling native dependencies, rebuild an existing Expo development
client (`cd expo && npm ci && npm run android`, or `npm run ios` on macOS).
`npm start` alone cannot add the native Expo GL module to an older binary.
SDK-compatible Expo Go includes Expo GL.

## Automated checks

```sh
pnpm exec vitest run shared/mascot-triggers.test.ts shared/orb-mascot.test.ts src/lib/orb-renderer.test.ts \
  src/components/Avatar.test.ts src/components/BotProfileAvatarCard.test.ts \
  src/components/BotIdentityAvatars.test.ts src/lib/mascot.test.ts \
  scripts/testing/mascot-triggers.test.ts
pnpm build
cd expo
npm test
npm run typecheck
npm run export -- --output-dir /tmp/openmaus-orb-expo-export
```

Tests cover bounded poses for every state, still expressions, colors,
geometry/resource lifetime, native surface admission, shared desktop context
lifecycle, avatar selection, and existing profile/editor behavior. An export
checks bundling, not actual device GL rendering.

The trigger integration test follows `docs/verification/README.md`: it launches
an isolated fake-engine server via `launchVerificationServer`, creates two
fixture bots, sends through the control surface, holds a reviewer behind a
gate, verifies the real `waitingForTeammates` wire signal, releases the reviewer
and verifies the completion reaction. It closes its own fixture and retains
commands, bounded messages and trigger results in the server log's
`.mascot.json` evidence file. This verifies signal delivery and classification,
not actual GPU rendering.

Visual verification is left to the user under `AGENTS.md`: compare the white
default and blue option, exercise color/expression controls, confirm uploaded images
and alternate bodies still appear, and check background/resume and reduced
motion on desktop and a rebuilt iOS/Android app. No UI fixtures, browsers,
emulators, or screenshot checks were run for this change.

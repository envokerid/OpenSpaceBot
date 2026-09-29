# Expo Local VM control

The computer preview now offers **Take control** when server discovery resolves
this conversation to a Local VM. The native controller supports single, double,
and right clicks, swipe scrolling, text entry, and common keyboard shortcuts.
On the desktop image, tap left-clicks, double-tap double-clicks, and holding for
half a second right-clicks. Single taps wait briefly to distinguish double taps;
the controller never sends an extra single click before a double/right click.
Dragging down scrolls up and dragging up scrolls down in the pane where the
swipe begins. A swipe sends one scroll on release and cancels click/hold detection.
Extra fingers, interrupted touches, layout changes and leaving control cancel
pending gestures. There are no click, drag, or scroll mode buttons.
The paired phone must have the existing **Cloud desktop access** grant enabled in
the host's Remote access settings. That grant now also covers Local VM input.

The route is pinned to a bot and thread and only accepts a fixed input schema.
It cannot execute arbitrary driver tools, operate the host desktop, or provision
containers. It verifies managed-container isolation before calling Cua Driver.
A renewable lease pauses the bot, excludes competing mobile controllers on the
same VM, and releases after 60 seconds without renewal (checked every 5 seconds).
VM proxy calls from other bots using that same shared target also see the hold.
Leaving the controller or backgrounding the app requests release; if the phone
loses its connection, expiry provides cleanup. In-flight input finishes before
normal release. Input is never automatically retried or queued.

Run from the root:

```sh
node_modules/.bin/vitest run server/mobile-vm-control.test.ts server/mobile-vm.e2e.test.ts server/computer-control.test.ts server/container-computer.test.ts companion/test/routes.test.ts
cd expo
npm run typecheck
npm test
```

`mobile-vm.e2e.test.ts` starts the production server and companion proxy on free
loopback ports in a disposable home. The production Expo client exercises the
capability gate, takeover, Unicode input, conflicting leases, sibling-thread
rejection, renewal, release, and refusal to control the host. Only the container
boundary is replaced, through a fixture-only Node import hook; input is recorded
inside that fixture's temporary data directory. It does not touch a real VM or
saved emulator. Unit tests additionally cover literal command arguments,
lease expiry, stale ownership, in-flight input, and letterboxed touch mapping.
`expo/tests/vmGestures.test.ts` uses a controlled clock to check gesture timing,
duplicate-click prevention, movement tolerance, cancellation, and swipe direction.
`expo/tests/vmPreview.test.ts` checks the capture/decode pipeline with a controlled
clock: up to eight frames per second without overlapping requests, retention of
the last decoded image, unchanged-frame reuse, immediate refresh after input,
decode timeouts, failure backoff, and shutdown during capture or decode. Takeover
frames use one authenticated, thread-scoped screenshot request; the endpoint
rechecks the VM surface. Images keep their native identity when promoted from
loading to visible, and Android image fading is disabled.

Visual verification remains manual: portrait/landscape layout, keyboard resizing,
tap/double-tap/hold, swipe scrolling, typing, Return to bot, system Back, and
backgrounding, and preview smoothness. Frames use serialized screenshot refreshes,
not video streaming; eight fps is a scheduling ceiling, not a measured guarantee.
Refresh latency depends on capture, native decoding, and the connection. Automated checks do not prove
native touch delivery or the installed VM driver's physical input behavior.

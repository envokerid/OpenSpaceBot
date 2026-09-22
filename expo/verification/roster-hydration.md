# Home loading skeletons

The initial fleet snapshot sets `State.hydrated`, including an empty workspace.
Until then, the home screen reserves a 117-point group strip and displays group
avatar/name placeholders plus six 76-point bot rows. The real group strip uses
the same minimum height and does not expand to consume extra vertical space.
The header already shows connection status, so initial connecting no longer
adds a temporary banner that shifts the whole list when removed. Offline and
revocation errors remain visible.

The first snapshot crossfades the skeleton into the actual roster over 280 ms.
Placeholders pulse during connection; Reduce Motion and backgrounding disable
animation. Refreshing and reconnecting preserve the loaded roster, and returning
from chat does not replay the loading transition. Search, Add and Updates wait
for the first snapshot; the footer shows loading instead of prematurely claiming
all work is caught up.

## Checks, 2026-09-22

- `npm run typecheck --prefix expo` and targeted oxlint passed.
- All 36 Expo tests passed, including empty-fleet hydration, retained readiness
  across reconnection, and a fresh loading state for a new session.
- Android and iOS production exports passed with two Metro workers. Output:
  `/tmp/omb-roster-hydration-export`; log:
  `/tmp/omb-roster-hydration-export.log`.
- The browser runtime reported no available browsers. The new visual transition
  has not been inspected in a browser or on a device.

No server behavior changed and no live user data was accessed or mutated.

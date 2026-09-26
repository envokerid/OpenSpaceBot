# Desktop companion ports

Run with Node 24 and the repository's installed Electron binary:

```sh
node scripts/verify-companion-ports.mjs
```

Linux needs a graphical session, or `xvfb-run -a`. The script launches an
isolated fake-engine server, a temporary Electron profile and companion data
directory, and chooses two free companion ports. It invokes the production
Electron companion manager to start the real companion, checks its control
API belongs to the owned child, opens and closes pairing, then stops it.
It prints the fixture URL, PID, data directory and retained server log path,
followed by a JSON result containing the selected ports and lifecycle result.
It does not pair a physical phone or exercise the Mobile Connect renderer.

For a development desktop alongside an installed app, set both
`OMB_COMPANION_PORT` (device connections) and `OMB_CONTROL_PORT` (local control)
before starting Electron. Defaults remain 8810 and 8811. Keep these distinct
from each other and from the harness and webhook ports. Use separate
`OMB_COMPANION_DIR`, Electron profile and workspace data for the development
copy. The desktop passes the configured ports to its child and uses the same
control port for status and pairing requests.

## Expo group-delete regression (2026-09-22)

The lifecycle fixture now creates and deletes a group through the paired,
Electron-owned companion and verifies group/history removal and preservation of
its member bot and the existing groups. This exercises the entry point selected
by the actual desktop, unlike Expo's source-only proxy fixture.

The old development entry resolver preferred `dist-companion/index.js`. An older
compiled route table reproduced `404 no route: DELETE /api/groups/:id`, despite
the current source allowing that route. Development now prefers TypeScript
sources, using the compiled entry only if sources are absent. Packaged builds
still use only their staged resource. The local compiled companion was rebuilt
as well; existing processes must restart to load new routes.

Reproduction: `/tmp/omb-group-delete-desktop-before.log` with isolated server log
`/tmp/openmausbot-verification-evidence/server-1790090717153-1524759.log`.
Passing Electron workflow: `/tmp/omb-group-delete-desktop-after.log` with server
log `/tmp/openmausbot-verification-evidence/server-1790090757177-1526738.log`.
Both fixtures cleaned up their owned processes and temporary data. The companion
build, lint, whitespace check and 99 entry-resolution/route tests passed.

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

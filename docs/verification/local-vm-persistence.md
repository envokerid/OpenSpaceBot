# Retained Local VM filesystems

Local VMs no longer expire after eight idle hours. The status API reports
`idle_timeout_ms: 0`. Stop/Start retains the same container filesystem;
explicit Delete/Replace remains destructive outside the workspace mount.
Docker containers use `unless-stopped` so daemon/host restarts resume the
existing container. No image upgrade or replacement is needed for retention.

Run the automated checks:

```sh
node node_modules/vitest/vitest.mjs run server/container-computer.test.ts server/local-vm-idle.test.ts server/group-local-vm.e2e.test.ts src/components/LocalComputerSection.test.ts src/components/ComputerPanel.test.ts src/components/ComputerPanel.i18n.test.ts
```

The isolated real-server chat fixture starts a stopped desktop through the
container boundary, mounts the computer tools, and revokes control on completion.
It rejects any unexpected create/delete command. The timer test advances a
disabled idle timer by thirty days without a shutdown callback.

For the actual Docker lifecycle, with the existing managed image prepared:

```sh
node --experimental-strip-types scripts/verify-local-vm-persistence.ts --docker
```

This launches the standard isolated verification server, checks its disabled
idle timeout, and creates a uniquely named disposable Docker container with
the production launch arguments. It installs a synthetic local Debian package
and writes files in `/etc`, `/opt`, Downloads, and the mounted workspace. After
Stop/Start, it checks the container ID, package registration, executable, file
contents and X display readiness without launching a browser or taking screenshots.
The fixture and container are removed; evidence and the server log remain
under `/tmp/openmausbot-verification-evidence` (the platform temp directory on
other hosts). It never stops, recreates, or writes test files into a user's VM.

This acceptance covers Linux Docker. Podman and Apple container command and
ownership checks are covered by unit tests, not a host-reboot acceptance run.
Renderer visual verification is left to the user.

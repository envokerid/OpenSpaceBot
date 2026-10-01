# Retained Local VM filesystems

Local VMs no longer expire after eight idle hours. The status API reports
`idle_timeout_ms: 0`. Stop/Start retains the same container filesystem;
The Docker **Recreate · keep apps & files** action saves the entire writable
filesystem and recreates from that snapshot. Explicit Delete remains destructive
for the active container outside the workspace mount; recovery copies remain.
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
It also reproduces the old missing-capability error, recreates the VM from a
full disk snapshot, installs Git and dependencies with ordinary `sudo apt-get`,
checks a clean `dpkg --audit`, then recreates again and verifies Git and saved
files survive. It checks the original rollback container remains available.
The fixture, containers and snapshots are removed; evidence and the server log remain
under `/tmp/openmausbot-verification-evidence` (the platform temp directory on
other hosts). It never stops, recreates, or writes test files into a user's VM.

This acceptance covers Linux Docker. Podman and Apple container command and
ownership checks are covered by unit tests, not a host-reboot acceptance run.
Renderer visual verification is left to the user.

Installer permissions are limited to SETUID/SETGID plus CHOWN, DAC_OVERRIDE and
FOWNER for filesystem ownership, protected system files and file modes, plus
AUDIT_WRITE for sudo audit events (avoiding its nonfatal permission warning). Podman
also retains SYS_CHROOT for Firefox. No privileged mode or host namespaces are
added. Older containers stay accepted until explicit recreation updates their
runtime permissions. VPS capability policy is unchanged.

Disk-preserving recreation currently supports Docker. It requires an existing,
compatible, idle VM. The service reserves the VM through the full operation and
retains its name, grants, defaults, conversation assignments and previous power
state. It stops the desktop before snapshotting, so open applications close;
unsaved in-memory work is not a disk file. A failed replacement rolls back to
the original container. A missing disk is never replaced with a blank image.
Snapshot compatibility is checked against the exact prepared image layer chain.
This is not an automatic base-image upgrade or a backup against host disk loss.

Recovery containers are retained locally with a `-recovery-` suffix and images
with a `retained-` tag. They consume disk space and are not automatically pruned.
If the server is killed between renaming and creating, these copies retain the
original disk for manual recovery; the registry reports a failed operation.

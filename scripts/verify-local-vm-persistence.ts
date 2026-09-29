// Opt-in, headless lifecycle acceptance. No browser or screenshot is opened.
// Uses only a uniquely named container and temporary workspace owned here.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { containerRunArgs, containerComputerStatus, localVmMountable, type LocalVmTarget } from "../server/container-computer.ts";
import { launchVerificationServer, runControlOmb } from "./control-omb.ts";

if (process.argv[2] !== "--docker") throw new Error("Pass --docker to use an isolated container on the local Docker engine");
const exec = promisify(execFile);
const docker = async (...args: string[]) => (await exec("docker", args, { timeout: 120_000, maxBuffer: 1024 * 1024 })).stdout.trim();
const home = await mkdtemp(join(tmpdir(), "omb-persistent-vm-"));
const target: LocalVmTarget = { key: "persistence-fixture", label: "persistence-fixture", containerName: `omb-persistence-${randomUUID()}`,
  workspaceDir: home, viewerPort: null };
const evidence: unknown[] = [];
const fixture = await launchVerificationServer();
let created = false;
try {
  evidence.push({ fixture: fixture.info, doctor: await runControlOmb(["doctor", "--url", fixture.info.url]) });
  const response = await fetch(fixture.info.url + "/api/local-computer");
  const state = await response.json() as { idle_timeout_ms: number };
  if (!response.ok || state.idle_timeout_ms !== 0) throw new Error("Automatic idle cleanup must be disabled");
  evidence.push({ idleTimeoutMs: state.idle_timeout_ms });
  await docker(...containerRunArgs("docker", randomUUID(), target));
  created = true;
  const inspected = await containerComputerStatus(undefined, undefined, target, { probeDesktop: false });
  if (!localVmMountable(inspected)) throw new Error(`Fixture failed the production ownership/isolation check: ${inspected.problem}`);
  const ready = async () => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        await docker("exec", "-u", "cua", "-e", "DISPLAY=:1", target.containerName, "xset", "q");
        return;
      } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    throw new Error("Fixture display did not resume: " + await docker("logs", "--tail", "30", target.containerName));
  };
  await ready();
  const beforeId = await docker("inspect", "--format", "{{.Id}}", target.containerName);
  if (await docker("inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", target.containerName) !== "unless-stopped") {
    throw new Error("Docker restart policy must preserve and resume the existing container");
  }
  await docker("exec", target.containerName, "sh", "-ec", `
    mkdir -p /tmp/omb-package/DEBIAN /tmp/omb-package/usr/local/bin /opt/omb-fixture
    printf 'Package: omb-persistence-fixture\nVersion: 1.0\nArchitecture: all\nMaintainer: Fixture <fixture@example.invalid>\nDescription: Persistence acceptance\n' > /tmp/omb-package/DEBIAN/control
    printf '%s\n' '#!/bin/sh' 'echo persistent-app' > /tmp/omb-package/usr/local/bin/omb-persistence-fixture
    chmod 755 /tmp/omb-package/usr/local/bin/omb-persistence-fixture
    dpkg-deb --build /tmp/omb-package /tmp/omb-package.deb
    dpkg -i /tmp/omb-package.deb
    for path in /etc/omb-persistence /opt/omb-fixture/file; do
      printf retained > "$path"
    done
  `);
  await docker("exec", "-u", "cua", target.containerName, "sh", "-ec", `
    mkdir -p /home/cua/Downloads
    printf retained > /home/cua/Downloads/omb-persistence
    printf retained > /home/cua/workspace/omb-persistence
  `);
  await docker("stop", "--time", "10", target.containerName);
  await docker("start", target.containerName);
  await ready();
  const afterId = await docker("inspect", "--format", "{{.Id}}", target.containerName);
  if (beforeId !== afterId) throw new Error("Container was replaced");
  const retained = await docker("exec", target.containerName, "sh", "-ec", `
    dpkg-query -W -f='\${Status}' omb-persistence-fixture | grep -q 'install ok installed'
    test "$(/usr/local/bin/omb-persistence-fixture)" = persistent-app
    for path in /etc/omb-persistence /opt/omb-fixture/file; do
      test "$(cat "$path")" = retained
    done
    printf 'installed package and all files retained'
  `);
  await docker("exec", "-u", "cua", target.containerName, "sh", "-ec", `
    test "$(cat /home/cua/Downloads/omb-persistence)" = retained
    test "$(cat /home/cua/workspace/omb-persistence)" = retained
  `);
  evidence.push({ containerIdPreserved: true, displayResumed: true, retained });
} finally {
  if (created) await docker("rm", "-f", target.containerName);
  await fixture.close();
  await rm(home, { recursive: true, force: true });
  const directory = join(tmpdir(), "openmausbot-verification-evidence");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `local-vm-persistence-${Date.now()}.json`);
  await writeFile(path, JSON.stringify({ evidence }, null, 2));
  console.log(JSON.stringify({ evidencePath: path, checks: evidence.slice(1) }));
}

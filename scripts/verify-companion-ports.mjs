// Real Electron companion lifecycle against an isolated fake-engine server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const flag = "--companion-ports-fixture";
if (process.versions.electron && process.argv.includes(flag)) {
  const { app } = await import("electron");
  const profile = join(process.env.OMB_DATA_DIR, "electron-profile");
  mkdirSync(profile, { recursive: true });
  app.setAppPath(root);
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
  const companion = await import("../electron/companion.mjs");
  app.whenReady().then(async () => {
    let passed = false;
    try {
      const state = await companion.startCompanion({
        resourcesPath: process.resourcesPath,
        harnessPort: Number(process.env.OMB_PORT),
        mutationToken: randomBytes(32).toString("base64url"),
        log: (line) => console.log(line),
      });
      assert.equal(state.enabled, true, state.error);
      assert.equal(state.port, Number(process.env.OMB_COMPANION_PORT));
      assert.equal(state.error, undefined);
      const control = await fetch(`http://127.0.0.1:${process.env.OMB_CONTROL_PORT}/state`).then(r => r.json());
      assert.equal(control.pid, companion.companionOriginTarget().pid);
      const opened = await companion.companionPairing(true);
      assert.ok(opened.pairing, "pairing opens through the overridden control port");
      const { createMobileSettingsRegistry } = await import("../electron/mobile-settings.mjs");
      const settings = createMobileSettingsRegistry();
      settings.register("organization:state", () => ({ status: "signed-out" }));
      settings.register("companion:keep-awake", (_event, enabled) => ({ enabled }));
      companion.setCompanionSettingsHandler((channel, args) => settings.invoke(channel, args));
      const origin = `http://127.0.0.1:${state.port}`;
      const paired = await fetch(`${origin}/api/pair`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: opened.pairing.code, deviceName: "Settings bridge fixture" }),
      }).then(response => response.json());
      assert.ok(paired.token);
      const invoke = (channel, args = []) => fetch(`${origin}/api/companion/desktop-settings`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${paired.token}` },
        body: JSON.stringify({ channel, args }),
      });
      assert.equal((await invoke("organization:state")).status, 403);
      await companion.companionSettingsAccess(paired.device.id, true);
      assert.deepEqual(await (await invoke("organization:state")).json(), { result: { status: "signed-out" } });
      assert.deepEqual(await (await invoke("companion:keep-awake", [true])).json(), { result: { enabled: true } });
      assert.equal((await invoke("shell:open", ["fixture"])).status, 400);
      await companion.companionSettingsAccess(paired.device.id, false);
      assert.equal((await invoke("organization:state")).status, 403);
      const closed = await companion.companionPairing(false);
      assert.equal(closed.pairing, null);
      console.log(JSON.stringify({ ok: true, companionPort: state.port, controlPort: Number(process.env.OMB_CONTROL_PORT), ownedPid: control.pid, pairingOpenedAndClosed: true, settingsBridgeGrantInvokeDenyAndRevoke: true }));
      passed = true;
    } catch (error) {
      console.error(error);
    } finally {
      await companion.stopCompanion();
      assert.equal(companion.companionRunning(), false);
      app.exit(passed ? 0 : 1);
    }
  }).catch(error => { console.error(error); app.exit(1); });
} else {
  const { launchVerificationServer } = await import("./control-omb.ts");
  const { waitForExit } = await import("../server/testing/cleanup.ts");
  const fixture = await launchVerificationServer();
  console.log(JSON.stringify({ fixture: fixture.info }));
  const reservations = [];
  let child;
  try {
    for (let i = 0; i < 2; i++) {
      const socket = createServer();
      await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
      reservations.push(socket);
    }
    const [companionPort, controlPort] = reservations.map(socket => socket.address().port);
    await Promise.all(reservations.map(socket => new Promise(resolve => socket.close(resolve))));
    const env = { ...process.env, HOME: fixture.info.dataDir, USERPROFILE: fixture.info.dataDir,
      OMB_DATA_DIR: fixture.info.dataDir, OMB_COMPANION_DIR: join(fixture.info.dataDir, "companion"),
      OMB_PORT: new URL(fixture.info.url).port, OMB_COMPANION_PORT: String(companionPort), OMB_CONTROL_PORT: String(controlPort),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.OMB_WEBHOOK_PORT;
    const electron = createRequire(import.meta.url)("electron");
    child = spawn(electron, ["--no-sandbox", fileURLToPath(import.meta.url), flag], { cwd: root, env, stdio: "inherit" });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("companion fixture timed out")), 45_000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); resolve(code); });
    });
    assert.equal(code, 0, "Electron companion lifecycle fixture");
  } finally {
    for (const socket of reservations) if (socket.listening) socket.close();
    await waitForExit(child, { signal: "SIGTERM" });
    await fixture.close();
  }
}

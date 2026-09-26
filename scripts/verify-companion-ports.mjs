// Real Electron companion lifecycle against an isolated fake-engine server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const flag = "--companion-ports-fixture";
const managed = process.argv.includes("--managed-settings");
if (process.versions.electron && process.argv.includes(flag)) {
  const { app, utilityProcess } = await import("electron");
  const profile = join(process.env.OMB_DATA_DIR, "electron-profile");
  mkdirSync(profile, { recursive: true });
  app.setAppPath(root);
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
  const companion = await import("../electron/companion.mjs");
  app.whenReady().then(async () => {
    let passed = false;
    let server, serverExit, lease;
    const relayToken = randomBytes(32).toString("base64url");
    try {
      if (managed) {
        const { acquireDataDirLease } = await import("../electron/data-dir-lease.mjs");
        const { pollServerIdentity } = await import("../electron/server-boot-probe.mjs");
        lease = acquireDataDirLease(process.env.OMB_DATA_DIR);
        let exited = false;
        server = utilityProcess.fork(join(root, "dist-server/index.js"), [], {
          cwd: process.env.HOME, stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, OMB_DESKTOP_PARENT: "1",
            OMB_WEBHOOK_PORT: String(Number(process.env.OMB_PORT) + 1),
            ...lease.utilityServerLeaseEnvironment() },
        });
        serverExit = new Promise(resolve => server.once("exit", () => { exited = true; resolve(); }));
        server.once("spawn", () => server.postMessage({ type: "openmausbot:desktop-mutation-token",
          token: randomBytes(32).toString("base64url"), companionToken: relayToken }));
        for (const stream of [server.stdout, server.stderr]) stream?.on("data", data => process.stdout.write(data));
        const identity = await pollServerIdentity({ port: Number(process.env.OMB_PORT), pid: () => server.pid,
          bootTimeoutMs: 20000, isExited: () => exited });
        assert.equal(identity.outcome, "ready", JSON.stringify(identity));
      }
      const state = await companion.startCompanion({
        resourcesPath: process.resourcesPath,
        harnessPort: Number(process.env.OMB_PORT),
        mutationToken: relayToken,
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
      const api = async (path, method = "GET", body) => {
        const response = await fetch(`${origin}${path}`, {
          method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${paired.token}` },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const result = await response.json();
        assert.ok(response.ok, `${method} ${path}: ${response.status} ${result.error ?? ""}`);
        return result;
      };
      const before = await api("/api/bots");
      const { bot } = await api("/api/bots", "POST", { name: "Companion group deletion probe" });
      const { group } = await api("/api/groups", "POST", {
        name: "Delete from Expo", memberIds: [bot.id],
        setup: { bulletin: "", defaultResponder: { kind: "member", botId: bot.id } },
      });
      await api(`/api/groups/${group.id}`, "DELETE");
      const after = await api("/api/bots");
      assert.deepEqual(after.groups.map(item => item.id).sort(), before.groups.map(item => item.id).sort());
      assert.ok(after.bots.some(item => item.id === bot.id), "group deletion preserves member bots");
      const deletedHistory = await fetch(`${origin}/api/threads/${group.threadId}/messages`, {
        headers: { Authorization: `Bearer ${paired.token}` },
      });
      assert.equal(deletedHistory.status, 404);
      console.log(JSON.stringify({ action: "delete group through Electron-owned companion", groupId: group.id, memberBotId: bot.id, groupRemoved: true, historyRemoved: true, memberPreserved: true }));
      const invoke = (channel, args = []) => fetch(`${origin}/api/companion/desktop-settings`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${paired.token}` },
        body: JSON.stringify({ channel, args }),
      });
      const config = (method = "GET", body) => fetch(`${origin}/api/config`, {
        method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${paired.token}`,
          "x-openmausbot-companion-settings": "1" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal((await config("PATCH", { profile: { name: "Denied" } })).status, 403);
      assert.equal((await invoke("organization:state")).status, 403);
      await companion.companionSettingsAccess(paired.device.id, true);
      assert.deepEqual(await (await invoke("organization:state")).json(), { result: { status: "signed-out" } });
      assert.deepEqual(await (await invoke("companion:keep-awake", [true])).json(), { result: { enabled: true } });
      assert.equal((await invoke("shell:open", ["fixture"])).status, 400);
      const saved = await config("PATCH", { profile: { name: "Electron phone settings fixture" } });
      assert.equal(saved.status, 200, await saved.text());
      assert.equal((await (await config()).json()).profile.name, "Electron phone settings fixture");
      await companion.companionSettingsAccess(paired.device.id, false);
      assert.equal((await invoke("organization:state")).status, 403);
      assert.equal((await config("PATCH", { profile: { name: "Denied after revocation" } })).status, 403);
      assert.equal((await (await config()).json()).profile.name, "Electron phone settings fixture");
      const closed = await companion.companionPairing(false);
      assert.equal(closed.pairing, null);
      console.log(JSON.stringify({ ok: true, companionPort: state.port, controlPort: Number(process.env.OMB_CONTROL_PORT), ownedPid: control.pid, pairingOpenedAndClosed: true, settingsBridgeGrantInvokeDenyAndRevoke: true, managedServer: managed, settingsPersistedAndRevoked: true, groupDeletionPreservesMembers: true }));
      passed = true;
    } catch (error) {
      console.error(error);
    } finally {
      await companion.stopCompanion();
      assert.equal(companion.companionRunning(), false);
      if (server) {
        server.kill();
        await Promise.race([serverExit, new Promise((_, reject) => setTimeout(() => reject(new Error("Owned server did not exit")), 6500))]);
      }
      lease?.release();
      app.exit(passed ? 0 : 1);
    }
  }).catch(error => { console.error(error); app.exit(1); });
} else {
  const { launchVerificationServer, verificationServerEnvironment } = await import("./control-omb.ts");
  const { waitForExit } = await import("../server/testing/cleanup.ts");
  const fixture = await launchVerificationServer();
  console.log(JSON.stringify({ fixture: fixture.info }));
  const reservations = [];
  let child;
  try {
    if (managed) await waitForExit(fixture.child, { signal: "SIGTERM" });
    for (let i = 0; i < 2; i++) {
      const socket = createServer();
      await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
      reservations.push(socket);
    }
    const [companionPort, controlPort] = reservations.map(socket => socket.address().port);
    await Promise.all(reservations.map(socket => new Promise(resolve => socket.close(resolve))));
    const staticDir = join(fixture.info.dataDir, "fixture-ui");
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>Isolated settings fixture</title>");
    const env = { ...verificationServerEnvironment(process.env, fixture.info.dataDir, Number(new URL(fixture.info.url).port)),
      DISPLAY: process.env.DISPLAY, XAUTHORITY: process.env.XAUTHORITY, OMB_STATIC_DIR: staticDir,
      OMB_DATA_DIR: fixture.info.dataDir, OMB_COMPANION_DIR: join(fixture.info.dataDir, "companion"),
      OMB_PORT: new URL(fixture.info.url).port, OMB_COMPANION_PORT: String(companionPort), OMB_CONTROL_PORT: String(controlPort),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.OMB_WEBHOOK_PORT;
    const electron = createRequire(import.meta.url)("electron");
    child = spawn(electron, ["--no-sandbox", fileURLToPath(import.meta.url), flag, ...(managed ? ["--managed-settings"] : [])], { cwd: root, env, stdio: "inherit" });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("companion fixture timed out")), 75_000);
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

// Every mutation targets the disposable server launched here. No URL override.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { restartFixture } from "../../scripts/verify-workspace-backup.ts";
import { waitForExit } from "../../server/testing/cleanup.ts";
import {
  launchVerificationServer,
  runControlOmb,
} from "../../scripts/control-omb.ts";
import { Client, pair } from "../src/core/client.ts";
import { parseInvite } from "../src/core/pairing.ts";

const fixture = await launchVerificationServer();
let backupChild: Awaited<ReturnType<typeof restartFixture>> | undefined;
try {
  backupChild = await restartFixture(fixture);
} catch (error) {
  await fixture.close();
  throw error;
}
process.env.OMB_COMPANION_DIR = join(
  fixture.info.dataDir,
  "settings-companion",
);
const { DeviceRegistry } = await import("../../companion/src/devices.ts");
const { createProxyHandler } = await import("../../companion/src/proxy.ts");
const registry = new DeviceRegistry();
const proxy = createProxyHandler({
  harnessPort: Number(new URL(fixture.info.url).port),
  authenticate: (token) => registry.authenticate(token),
  redeem: (code, name, requestId) => registry.redeem(code, name, requestId),
  serverName: () => "Workspace settings fixture",
});
const sidecar = createServer(proxy);
const evidence: unknown[] = [{ fixture: fixture.info }];
try {
  sidecar.listen(0, "127.0.0.1");
  await once(sidecar, "listening");
  const address = sidecar.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const window = registry.openPairing();
  const paired = await pair(
    parseInvite(
      `openmausbot://pair?address=${encodeURIComponent(origin)}&token=${window.token}`,
    ),
    "Settings verification",
    randomUUID(),
  );
  const client = new Client(paired.connection, paired.token);
  const device = registry.authenticate(paired.token)!;
  assert.deepEqual(await client.request("/api/companion/settings-access"), {
    allowed: false,
    desktop: false,
  });
  for (const [path, method] of [
    ["/api/config", "PATCH"],
    ["/api/usage", "GET"],
    ["/api/workspace-backup/status", "GET"],
    ["/api/instances/claude/icon", "PATCH"],
  ]) {
    await assert.rejects(
      client.request(path, method, method === "GET" ? undefined : {}),
      /settings access is off/i,
    );
  }
  registry.setSettingsAccess(device.id, true);
  assert.equal(
    new DeviceRegistry().authenticate(paired.token)?.settingsAccess,
    true,
  );
  assert.equal(
    (await client.request("/api/companion/settings-access")).allowed,
    true,
  );
  evidence.push({
    action:
      "Settings access denied by default; explicit grant persists across registry restart",
    passed: true,
  });

  const profile = {
    name: "Expo settings fixture",
    email: "phone@example.test",
  };
  const profiles = (await client.request("/api/config")).browserProfiles as {
    id: string;
    name: string;
  }[];
  const added = { id: randomUUID(), name: "Phone browser profile" };
  await client.request("/api/config", "PATCH", {
    profile,
    language: "en",
    rooms: { turnTimeoutMinutes: 17 },
    threads: { maxConcurrentPerBot: 2 },
    features: { showToolCalls: true },
    vps: { sshAlias: "fixture-only-host" },
    browserProfiles: [...profiles, added],
    expectedBrowserProfiles: profiles,
    tts: { provider: "system" },
    imageGen: {
      provider: "custom",
      customUrl: "http://127.0.0.1:1/v1/images/generations",
      customModel: "fixture-model",
    },
  });
  const config = await client.request<any>("/api/config");
  assert.deepEqual(config.profile, profile);
  assert.equal(config.rooms.turnTimeoutMinutes, 17);
  assert.equal(config.threads.maxConcurrentPerBot, 2);
  assert.equal(config.features.showToolCalls, true);
  assert.equal(config.vps.sshAlias, "fixture-only-host");
  assert.ok(config.browserProfiles.some((p: any) => p.id === added.id));
  assert.equal(config.imageGen.customModel, "fixture-model");
  assert.equal(config.tts.provider, "system");
  const disk = JSON.parse(
    readFileSync(join(fixture.info.dataDir, "config.json"), "utf8"),
  );
  assert.deepEqual(disk.profile, profile);
  await assert.rejects(
    client.request("/api/config", "PATCH", {
      threads: { maxConcurrentPerBot: 999 },
    }),
    /concurrent|invalid|10|config/i,
  );
  await assert.rejects(
    client.request("/api/config", "PATCH", {
      browserProfiles: profiles,
      expectedBrowserProfiles: profiles,
    }),
    /changed|conflict/i,
  );
  evidence.push({
    action:
      "Profile, language, turn limit, concurrency, browser profiles, VPS, voice and image settings persisted; invalid/stale writes refused",
    config: {
      profile: config.profile,
      rooms: config.rooms,
      threads: config.threads,
      tts: config.tts,
      imageGen: config.imageGen,
    },
  });

  // These dummy values never reach a provider: no model or key test is run.
  await client.request("/api/config", "PATCH", {
    anthropic: { key: "fixture-secret-not-a-real-key" },
  });
  const keyed = await client.request<any>("/api/config");
  assert.equal(keyed.anthropic.configured, true);
  assert.ok(!JSON.stringify(keyed).includes("fixture-secret-not-a-real-key"));
  await client.request("/api/config", "PATCH", { anthropic: { key: "" } });
  assert.equal(
    (await client.request<any>("/api/config")).anthropic.configured,
    false,
  );
  await client.request("/api/instances/claude/icon", "PATCH", {
    icon: { kind: "preset", preset: "anthropic" },
  });
  const engines = await client.request<any>("/api/instances");
  assert.equal(
    engines.instances.find((e: any) => e.instanceId === "claude").icon.preset,
    "anthropic",
  );
  const usage = await client.request<any>("/api/usage?groupBy=model");
  assert.ok(Array.isArray(usage.groups));
  assert.equal(
    (await client.response("/api/usage.csv")).headers.get("content-type"),
    "text/csv; charset=utf-8",
  );
  evidence.push({
    action:
      "Provider key save/removal with write-only secret; engine icon persistence; usage JSON and CSV",
    passed: true,
  });

  const offer = await client.request<any>("/api/auth/pairing", "POST", {
    scopes: ["client"],
    label: "Temporary fixture session",
  });
  const hosted = await fetch(`${fixture.info.url}/api/auth/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: offer.code,
      label: "Settings fixture member",
    }),
  });
  assert.equal(hosted.status, 200);
  const signed = (await hosted.json()) as any;
  const member = new Client(
    {
      ...paired.connection,
      server: true,
      endpoint: { ...paired.connection.endpoint, url: fixture.info.url },
    },
    signed.token,
  );
  await assert.rejects(
    member.request("/api/config", "PATCH", { profile: { name: "Denied" } }),
    /admin|forbidden|403/i,
  );
  const sessions = await client.request<any>("/api/auth/sessions");
  const session = sessions.sessions.find(
    (s: any) => s.label === "Settings fixture member",
  );
  assert.ok(session);
  await client.request(`/api/auth/sessions/${session.id}`, "DELETE");
  await assert.rejects(member.fleet(), /session|sign in|401|authentication/i);
  evidence.push({
    action:
      "Create member pairing; direct hosted member cannot administer; revoke its session",
    passed: true,
  });

  const created = await runControlOmb([
    "new-bot",
    "--name",
    "Settings Probe",
    "--url",
    fixture.info.url,
  ]);
  evidence.push({
    command: "control:omb new-bot --name Settings Probe",
    result: created,
  });
  const createdBot = (created as any).bot;
  const approved = await client.request<any>("/api/settings/approved-commands");
  assert.ok(approved.tools.includes("composio_multi_execute_tool"));
  assert.ok(approved.bots.some((bot: any) => bot.id === createdBot.id));
  const revokedCommand = await client.request<any>(
    "/api/settings/approved-commands",
    "PATCH",
    {
      botId: createdBot.id,
      tool: "composio_multi_execute_tool",
      approved: false,
    },
  );
  assert.equal(
    revokedCommand.bots.find((bot: any) => bot.id === createdBot.id)
      .approvals.composio_multi_execute_tool,
    false,
  );
  evidence.push({
    action:
      "Approved commands available through granted Expo settings access; default Composio command revoked for fixture bot",
    passed: true,
  });
  const bulkCommand = await client.request<any>("/api/settings/approved-commands", "PATCH", {
    allBots: true, tool: "mcp__fixture__lookup", approved: true, includeNewBots: true,
  });
  assert.equal(bulkCommand.newBotApprovals.mcp__fixture__lookup, true);
  assert.ok(bulkCommand.bots.every((bot: any) => bot.approvals.mcp__fixture__lookup === true));
  const futureCommand = await client.request<any>("/api/settings/approved-commands", "PATCH", {
    botIds: [], tool: "mcp__fixture__lookup", approved: true, includeNewBots: false,
  });
  assert.equal(futureCommand.newBotApprovals.mcp__fixture__lookup, false);
  assert.ok(futureCommand.bots.every((bot: any) => bot.approvals.mcp__fixture__lookup === true));
  evidence.push({ action: "Paired phone approved all bots and changed the future-bot default without revoking existing bots", passed: true });
  const password = "isolated-fixture-backup-password";
  const exported = await client.request<any>(
    "/api/workspace-backup/export",
    "POST",
    { password, clientState: {} },
    120000,
  );
  const archive = new Uint8Array(
    await (
      await client.response(
        `/api/workspace-backup/download/${exported.id}`,
        {},
        120000,
      )
    ).arrayBuffer(),
  );
  assert.ok(archive.byteLength > 100);
  const uploaded = await client.response(
    "/api/workspace-backup/upload",
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: archive,
    },
    120000,
  );
  const upload = JSON.parse(await uploaded.text());
  const preview = await client.request<any>(
    "/api/workspace-backup/preview",
    "POST",
    { id: upload.id, password },
    120000,
  );
  assert.ok(preview.summary.bots > 0);
  await assert.rejects(
    client.request("/api/workspace-backup/restore", "POST", {
      id: preview.id,
      confirmation: "NO",
    }),
    /REPLACE|confirm/i,
  );
  evidence.push({
    action:
      "Encrypted backup export/download/upload/preview; restore rejected without exact confirmation",
    bytes: archive.byteLength,
    summary: preview.summary,
  });

  registry.setSettingsAccess(device.id, false);
  await assert.rejects(
    client.request("/api/config", "PATCH", {
      profile: { name: "Denied after revocation" },
    }),
    /settings access is off/i,
  );
  assert.equal(
    (await client.request<any>("/api/config")).vps.sshAlias,
    undefined,
  );
  assert.deepEqual((await client.request<any>("/api/config")).profile, profile);
  evidence.push({
    action:
      "Revoked grant immediately denies writes and withholds host SSH alias",
    passed: true,
  });

  if (process.argv.includes("--interactive")) {
    const printPair = () => {
      const p = registry.openPairing();
      console.log(
        JSON.stringify({
          fixture: fixture.info,
          companionUrl: origin,
          pairingLink: `openmausbot://pair?address=${encodeURIComponent(origin)}&token=${p.token}`,
          pairingCode: p.code,
        }),
      );
    };
    printPair();
    console.log(
      "Commands: pair, grant, revoke, config. Ctrl-C cleans up this fixture.",
    );
    const input = createInterface({ input: process.stdin });
    input.on("line", (line) => {
      if (line.trim() === "pair") printPair();
      if (["grant", "revoke"].includes(line.trim())) {
        for (const d of registry.list())
          registry.setSettingsAccess(d.id, line.trim() === "grant");
        console.log(JSON.stringify({ devices: registry.list() }));
      }
      if (line.trim() === "config")
        void client.request("/api/config").then((value) => {
          evidence.push({
            action: "Read settings after native UI save",
            config: value,
          });
          console.log(JSON.stringify(value));
        });
    });
    await new Promise<void>((resolve) => process.once("SIGINT", resolve));
    input.close();
  } else {
    registry.setSettingsAccess(device.id, true);
    await client.request(
      "/api/workspace-backup/restore",
      "POST",
      { id: preview.id, confirmation: "REPLACE" },
      120000,
    );
    assert.equal(
      (await client.request("/api/workspace-backup/status")).pendingRestore,
      true,
    );
    evidence.push({
      action: "Confirmed restore staged on disposable server only",
      passed: true,
    });
  }
} finally {
  writeFileSync(
    fixture.info.logPath + ".settings.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(`Settings evidence: ${fixture.info.logPath}.settings.json`);
  sidecar.closeAllConnections();
  await new Promise<void>((resolve) => sidecar.close(() => resolve()));
  await waitForExit(backupChild, { signal: "SIGTERM" });
  await fixture.close();
}

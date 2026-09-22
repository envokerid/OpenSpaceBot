import { createServer, type RequestListener, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, expect, it } from "vitest";
import { denyReason } from "../src/routes.ts";
import { scrub } from "../src/wire.ts";
import { createConnectedDeviceTracker } from "../src/connected-devices.ts";
import { createProxyHandler, proxyHeadersTimeoutMs } from "../src/proxy.ts";

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function listen(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  return { origin: `http://127.0.0.1:${address.port}`, port: address.port };
}

it("settings grant opens exact operations and never widens ordinary pairing", () => {
  for (const [method, path] of [
    ["PATCH", "/api/config"],
    ["POST", "/api/instances/claude/auth/start"],
    ["PATCH", "/api/instances/company.a/icon"],
    ["GET", "/api/usage.csv"],
    ["POST", "/api/workspace-backup/restore"],
    ["GET", "/api/auth/sessions"],
    ["POST", "/api/companion/desktop-settings"],
    ["DELETE", "/api/fleet/workspaces/demo"],
  ]) {
    expect(
      denyReason({ method, path, authenticated: false, settingsAccess: true })
        ?.status,
    ).toBe(401);
    expect(denyReason({ method, path, authenticated: true })?.status).toBe(403);
    expect(
      denyReason({ method, path, authenticated: true, settingsAccess: true }),
    ).toBeNull();
  }
  for (const [method, path] of [
    ["GET", "/api/secrets"],
    ["POST", "/api/instances"],
    ["GET", "/api/instances/claude/install"],
    ["POST", "/api/computers/vps/demo/sleep"],
    ["POST", "/api/local-computer/install"],
    ["PATCH", "/api/instances/claude/icon/extra"],
    ["POST", "/api/internal/execute"],
  ])
    expect(
      denyReason({ method, path, authenticated: true, settingsAccess: true }),
    ).not.toBeNull();
  expect(
    scrub(
      { vps: { sshAlias: "host" }, resumeCursors: { secret: "cursor" } },
      true,
    ),
  ).toEqual({ vps: { sshAlias: "host" } });
  expect(scrub({ vps: { sshAlias: "host" } })).toEqual({ vps: {} });
});

it("proxy keeps desktop IPC local, checks grants and suppresses results after revocation", async () => {
  let allowed = false;
  let calls = 0;
  let finish: ((value: unknown) => void) | undefined;
  const fixture = await listen(
    createProxyHandler({
      harnessPort: 1,
      authenticate: (token) =>
        token === "fixture"
          ? { id: "phone", cloudDesktopAccess: false, settingsAccess: allowed }
          : null,
      redeem: () => ({ error: "disabled" }),
      serverName: () => "fixture",
      desktopSettings: async () => {
        calls++;
        return await new Promise((resolve) => {
          finish = resolve;
        });
      },
    }),
  );
  const request = (channel: string) =>
    fetch(fixture.origin + "/api/companion/desktop-settings", {
      method: "POST",
      headers: {
        Authorization: "Bearer fixture",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, args: [] }),
    });
  expect((await request("organization:state")).status).toBe(403);
  expect(calls).toBe(0);
  allowed = true;
  const pending = request("organization:state");
  await expect.poll(() => calls).toBe(1);
  allowed = false;
  finish!({ privateAccount: "must not escape" });
  const response = await pending;
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain("privateAccount");
  allowed = true;
  const success = request("organization:state");
  await expect.poll(() => calls).toBe(2);
  finish!({ status: "signed-out" });
  expect(await (await success).json()).toEqual({
    result: { status: "signed-out" },
  });
});

it("long administrative operations have bounded time to finish", () => {
  expect(proxyHeadersTimeoutMs("/api/local-computer/pull")).toBe(600000);
  expect(proxyHeadersTimeoutMs("/api/workspace-backup/export")).toBe(180000);
  expect(proxyHeadersTimeoutMs("/api/bots")).toBe(30000);
});

it("revocation terminates a backup already downloading", async () => {
  const tracker = createConnectedDeviceTracker();
  const upstream = await listen((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.write("encrypted fixture bytes");
  });
  const proxy = await listen(
    createProxyHandler({
      harnessPort: upstream.port,
      authenticate: () => ({
        id: "phone",
        settingsAccess: true,
        cloudDesktopAccess: false,
      }),
      connected: tracker.open,
      redeem: () => ({ error: "disabled" }),
      serverName: () => "fixture",
    }),
  );
  const response = await fetch(
    proxy.origin + "/api/workspace-backup/download/fixture",
  );
  const reader = response.body!.getReader();
  expect((await reader.read()).done).toBe(false);
  expect(tracker.ids()).toEqual(["phone"]);
  tracker.disconnect("phone");
  await expect(reader.read()).rejects.toThrow();
  expect(tracker.ids()).toEqual([]);
});

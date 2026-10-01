// Owned synthetic accounts, fake-engine workspace, and real companion proxy.
// No live URL or provider credentials are accepted.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { launchVerificationServer } from "../../scripts/control-omb.ts";
import { Client, pair } from "../src/core/client.ts";
import { parseInvite } from "../src/core/pairing.ts";
import { Session } from "../src/core/session.ts";
import type { Bot } from "../src/core/types.ts";

const accounts = ["work", "personal", "pending"].map((alias, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`, alias, slug: "gmail", status: alias === "pending" ? "PENDING" : "ACTIVE",
}));
const provider = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/connector-inventory") return res.end(JSON.stringify({ version: 1, accounts, providers: [
    { slug: "gmail", label: "Fixture mail", blurb: "Synthetic accounts", logo: null, domain: "fixture.invalid", remote: { url: "https://fixture.invalid/mcp", auth: "none" } },
  ] }));
  res.writeHead(404); res.end("{}");
});
provider.listen(0, "127.0.0.1");
await once(provider, "listening");
const address = provider.address();
assert.ok(address && typeof address !== "string");
let fixture: Awaited<ReturnType<typeof launchVerificationServer>> | undefined;
let sidecar: ReturnType<typeof createServer> | undefined;
let session: Session | undefined;
const evidence: unknown[] = [];
const until = async (check: () => boolean) => {
  const end = Date.now() + 10000;
  while (!check()) {
    assert.ok(Date.now() < end, "Mobile stream must reflect the approval");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};
try {
  fixture = await launchVerificationServer(
    process.env,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    [],
    undefined,
    `http://127.0.0.1:${address.port}`,
  );
  process.env.OMB_COMPANION_DIR = join(fixture.info.dataDir, "companion");
  const { DeviceRegistry } = await import("../../companion/src/devices.ts");
  const { createProxyHandler } = await import("../../companion/src/proxy.ts");
  const registry = new DeviceRegistry();
  sidecar = createServer(
    createProxyHandler({
      harnessPort: Number(new URL(fixture.info.url).port),
      authenticate: (token) => registry.authenticate(token),
      redeem: (code, name, id) => registry.redeem(code, name, id),
      serverName: () => "Connected apps fixture",
    }),
  );
  sidecar.listen(0, "127.0.0.1");
  await once(sidecar, "listening");
  const bound = sidecar.address();
  assert.ok(bound && typeof bound !== "string");
  const origin = `http://127.0.0.1:${bound.port}`;
  const invite = () => {
    const window = registry.openPairing();
    return `openmausbot://pair?address=${encodeURIComponent(origin)}&token=${window.token}`;
  };
  const paired = await pair(
    parseInvite(invite()),
    "Connector verification",
    randomUUID(),
  );
  const client = new Client(paired.connection, paired.token);
  const { bot } = await client.request<{ bot: Bot }>("/api/bots", "POST", {
    name: "Pepper",
  });
  const { bot: other } = await client.request<{ bot: Bot }>(
    "/api/bots",
    "POST",
    { name: "Biscuit" },
  );
  const route = (id: string, account: string, slug = "gmail") =>
    `/api/bots/${id}/connector-accounts/${slug}/${account}`;
  const disabled = await fetch(`${fixture.info.url}/api/bots/${bot.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectors: false }),
  });
  assert.equal(disabled.status, 200);
  session = new Session(client);
  session.start();
  await until(() => session!.state.status === "connected");
  await client.request(route(bot.id, "00000000-0000-4000-8000-000000000001"), "POST");
  await until(
    () =>
      session!.state.bots
        .find((b) => b.id === bot.id)
        ?.connectorAccounts?.gmail?.includes("00000000-0000-4000-8000-000000000001") === true,
  );
  assert.equal(session.state.bots.find((b) => b.id === bot.id)?.connectors, true);
  await client.request(route(bot.id, "00000000-0000-4000-8000-000000000002"), "POST");
  await client.request(route(bot.id, "00000000-0000-4000-8000-000000000001"), "POST");
  await session.refresh();
  assert.deepEqual(
    session.state.bots.find((b) => b.id === bot.id)?.connectorAccounts,
    { gmail: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"] },
  );
  assert.deepEqual(
    session.state.bots.find((b) => b.id === other.id)?.connectorAccounts ?? {},
    {},
  );
  for (const path of [
    route(bot.id, "00000000-0000-4000-8000-000000000003"),
    route(bot.id, "ca_missing"),
    route(bot.id, "00000000-0000-4000-8000-000000000001", "slack"),
  ])
    await assert.rejects(client.request(path, "POST"), /active account/i);
  await assert.rejects(
    client.request(route(bot.id, "00000000-0000-4000-8000-000000000001"), "PATCH"),
    /not exposed|not available|no route/i,
  );
  await assert.rejects(
    new Client(paired.connection, "invalid").request(
      route(bot.id, "00000000-0000-4000-8000-000000000001"),
      "POST",
    ),
    /pair|unauthorized/i,
  );
  await client.request(route(bot.id, "00000000-0000-4000-8000-000000000001"), "DELETE");
  await until(
    () =>
      session!.state.bots.find((b) => b.id === bot.id)?.connectorAccounts?.gmail
        ?.length === 1,
  );
  const stored = JSON.parse(
    readFileSync(join(fixture.info.dataDir, "bots.json"), "utf8"),
  ).find((b: Bot) => b.id === bot.id);
  assert.deepEqual(stored.connectorAccounts, { gmail: ["00000000-0000-4000-8000-000000000002"] });
  evidence.push({
    action:
      "Add two exact accounts, idempotent add, enable connected apps, stream updates, wrong/pending/missing account refusal, method/auth rejection, remove and persisted state",
    bot: bot.id,
    stored: stored.connectorAccounts,
    status: "passed",
  });
  await client.request(route(bot.id, "00000000-0000-4000-8000-000000000002"), "DELETE");
  await session.refresh();
  assert.deepEqual(
    session.state.bots.find((b) => b.id === bot.id)?.connectorAccounts ?? {},
    {},
  );
  session.stop();
  if (process.argv.includes("--interactive")) {
    const input = createInterface({ input: process.stdin });
    input.on("line", line => {
      if (line.trim() === "pair") console.log(JSON.stringify({ companionUrl: origin, pairingLink: invite() }));
    });
    console.log(
      JSON.stringify({
        fixture: fixture.info,
        companionUrl: origin,
        pairingLink: invite(),
        botId: bot.id,
        otherBotId: other.id,
      }),
    );
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
    input.close();
    evidence.push({
      action: "Native UI final bot approvals",
      // Ctrl-C also reaches the owned child. Read its saved state rather than
      // issuing another HTTP request while the process group is shutting down.
      bots: (JSON.parse(readFileSync(join(fixture.info.dataDir, "bots.json"), "utf8")) as Bot[]).map((b) => ({
        id: b.id,
        name: b.name,
        connectorAccounts: b.connectorAccounts,
      })),
    });
  }
  console.log(JSON.stringify({ ok: true, fixture: fixture.info, evidence }));
} finally {
  session?.stop();
  if (fixture)
    writeFileSync(
      fixture.info.logPath + ".expo-connector-accounts.json",
      JSON.stringify(evidence, null, 2),
    );
  if (sidecar) {
    sidecar.closeAllConnections();
    await new Promise<void>((resolve) => sidecar!.close(() => resolve()));
  }
  await fixture?.close();
  provider.closeAllConnections();
  await new Promise<void>((resolve) => provider.close(() => resolve()));
}

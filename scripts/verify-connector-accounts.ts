// Real renderer and owner API against an isolated, synthetic account inventory.
import { createServer } from "node:http";
import { launchUi } from "./testing/control-omb-ui.ts";

const accounts = ["work", "personal"].map((alias) => ({ id: `ca_${alias}`, alias, status: "ACTIVE", toolkit: { slug: "gmail" } }));
const stub = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://fixture");
  res.setHeader("content-type", "application/json");
  if (url.pathname.endsWith("/connected_accounts")) return res.end(JSON.stringify({ items: accounts }));
  if (url.pathname.endsWith("/auth_configs")) return res.end(JSON.stringify({ items: [] }));
  if (url.pathname.endsWith("/toolkits")) return res.end(JSON.stringify({ items: [{ slug: "gmail", name: "Gmail", description: "Fixture mail accounts", connected_account: accounts[0] }] }));
  if (url.pathname === "/api/v3.1/tool_router/session/trs_fixture") return res.end(JSON.stringify({
    session_id: "trs_fixture", mcp: { type: "http", url: "https://app.composio.dev/fixture-unused" },
    config: { user_id: "fixture_user", multi_account: { enable: true } },
  }));
  res.writeHead(404);
  res.end(JSON.stringify({ error: "No provider execution in this fixture" }));
});
await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
const address = stub.address();
if (!address || typeof address === "string") throw new Error("Fixture did not bind");
try {
  await launchUi([], process.env, process, { connectorFixtureApi: `http://127.0.0.1:${address.port}` });
} finally {
  stub.closeAllConnections();
  await new Promise<void>((resolve) => stub.close(() => resolve()));
}

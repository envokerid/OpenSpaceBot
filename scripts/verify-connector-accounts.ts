// Real renderer and owner API against an isolated, synthetic account inventory.
import { createServer } from "node:http";
import { launchUi } from "./testing/control-omb-ui.ts";

const accounts = ["work", "personal", "pending"].map((alias, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`, alias, slug: "gmail", status: alias === "pending" ? "PENDING" : "ACTIVE",
}));
const stub = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/connector-inventory") return res.end(JSON.stringify({ version: 1, accounts, providers: [
    { slug: "gmail", label: "Fixture mail", blurb: "Synthetic accounts", logo: null, domain: "fixture.invalid", remote: { url: "https://fixture.invalid/mcp", auth: "none" } },
  ] }));
  res.writeHead(404); res.end("{}");
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

// Simulated guest process only. Authentication and lazy VM claims still hit
// the isolated production server, using its actual mounted turn credential.
import { readFileSync } from "node:fs";
import { createControlClient } from "../control-client.ts";
import { turnToken } from "../turn-token.ts";
import { parseRegisteredVmMcp } from "../registered-mcp.ts";
const fixture = process.env.OMB_VM_LIBRARY_FIXTURE;
if (!fixture || !JSON.parse(readFileSync(fixture, "utf8")).mcpProbe) throw new Error("VM registration fixture required");
const state = await createControlClient({ url: process.env.OMB_CONTROL_URL, token: turnToken(process.env, "OMB_CONTROL_TOKEN") }).state(true);
if (state.held) throw new Error(state.blockedReason ?? "VM held");
const spec = parseRegisteredVmMcp(process.env.OMB_VM_MCP_SPEC!);
if (spec.command === "fixture-fail") process.exit(1);
await import("./fake-mcp-server.ts");

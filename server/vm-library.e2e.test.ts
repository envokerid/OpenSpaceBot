import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createControlClient } from "./control-client.ts";
import { instanceLocalVmTarget } from "./container-computer.ts";
import { freePortBlock } from "./testing/ports.ts";
import { removeTempDir, waitForExit } from "./testing/cleanup.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
let home = "", data = "", base = "", machineFile = "", log = "";
let child: ChildProcess;
let requestNumber = 0;
const api = async (path: string, method = "GET", body?: unknown, expected = 0): Promise<any> => {
 const response = await fetch(base + path, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
 const result = await response.json(); if (expected) expect(response.status, JSON.stringify(result)).toBe(expected); else expect(response.ok, JSON.stringify(result)).toBe(true); return result;
};
async function inventory() { return api("/api/vms"); }
async function idle(id: string) {
 const deadline = Date.now() + 10000;
 for (;;) { const list = await inventory(); const vm = list.instances.find((vm: any) => vm.id === id); if (!vm || vm.operation?.state !== "running") return vm; if (Date.now() > deadline) throw new Error("VM job timed out"); await new Promise(resolve => setTimeout(resolve, 30)); }
}
async function create(name: string, access: unknown, start = true) {
 const requestId = `create-${++requestNumber}`;
 await api("/api/vms", "POST", { name, access, start, requestId }, 202);
 const list = await inventory(); const vm = list.instances.find((vm: any) => vm.name === name);
 expect((await idle(vm.id)).operation.state).toBe("completed"); return vm.id;
}
async function bind(kind: string, id: string, vmId: string | null, expected = 200) { return api(`/api/computer-bindings/${kind}/${id}`, "PUT", { vmId, revision: (await inventory()).revision }, expected); }
async function action(id: string, operation: string, extra: object = {}, expected = 202) { return api(`/api/vms/${id}/actions`, "POST", { revision: (await inventory()).revision, requestId: `action-${++requestNumber}`, action: operation, ...extra }, expected); }

beforeAll(async () => {
 home = mkdtempSync(join(tmpdir(), "omb-vm-library-http-")); data = join(home, "data"); mkdirSync(data);
 machineFile = join(data, "machines.json"); writeFileSync(machineFile, JSON.stringify({ machines: { shared: { state: "running", files: { "/opt/existing": "keep" } } }, actions: [] }));
 writeFileSync(join(data, "config.json"), JSON.stringify({ localVm: { mode: "shared", maxInstances: 4 }, instances: { claude: { driver: "claudeAgent", config: { cli: join(root, "server/testing/fake-claude-cli.ts") }, environment: { FAKE_CLAUDE_MODE: "slow", FAKE_CLAUDE_DUMP: join(data, "engine.json"), FAKE_CLAUDE_SLOW_FINISH_GATE: join(data, "finish") } } } }));
 const port = await freePortBlock([0, 1]); base = `http://127.0.0.1:${port}`;
 child = spawn(process.execPath, ["--import", pathToFileURL(join(root, "server/testing/vm-library-hooks.mjs")).href, join(root, "server/index.ts")], { cwd: root, env: { PATH: dirname(process.execPath), HOME: home, USERPROFILE: home, OMB_DATA_DIR: data, OMB_PORT: String(port), OMB_WEBHOOK_PORT: String(port + 1), OMB_VM_LIBRARY_FIXTURE: machineFile, TMPDIR: home, APPDATA: join(home, "appdata"), LOCALAPPDATA: join(home, "localappdata") }, stdio: ["ignore", "pipe", "pipe"] });
 child.stdout!.on("data", () => {}); child.stderr!.on("data", value => { log += value; });
 const deadline = Date.now() + 30000;
 for (;;) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} if (child.exitCode !== null || Date.now() > deadline) throw new Error(log); await new Promise(resolve => setTimeout(resolve, 100)); }
}, 45000);
afterAll(async () => { await waitForExit(child, { signal: "SIGTERM" }); if (home) await removeTempDir(home); });

it("migrates, creates, shares, isolates and routes group tools through the production server", async () => {
 const migrated = await inventory(); expect(migrated.instances.map((vm: any) => vm.id)).toContain("legacy-shared");
 expect(JSON.parse(readFileSync(machineFile, "utf8")).actions).toEqual([]);
 expect(migrated.instances.find((vm: any) => vm.id === "legacy-shared")).toMatchObject({ state: "running", ready: false, problem: null });
 const bots = [];
 for (const name of ["Chief fixture", "Writer fixture"]) { const { bot } = await api("/api/bots", "POST", { name }); await api(`/api/bots/${bot.id}`, "PATCH", { computer: "vm", browser: false, modelSelection: { instanceId: "claude", model: "sonnet" } }); bots.push(bot); }
 const { group } = await api("/api/groups", "POST", { name: "Research fixture", memberIds: bots.map(bot => bot.id), setup: { bulletin: "", defaultResponder: { kind: "member", botId: bots[0].id } } });
 const privateId = await create("Private fixture", { mode: "isolated", grants: [{ kind: "bot", id: bots[0].id }] });
 const groupId = await create("Group fixture", { mode: "isolated", grants: [{ kind: "group", id: group.id }] });
 await bind("bot", bots[0].id, privateId); await bind("group", group.id, groupId);
 await bind("bot", bots[1].id, privateId, 403); await bind("bot", bots[0].id, groupId, 403);
 // Every card uses the requested VM identity, without rebinding the conversation.
 const vmView = (id: string, kind: string, subjectId: string, route: string) => `/api/vms/${id}/${route}?kind=${kind}&subjectId=${subjectId}`;
 const privateScreenResponse = await fetch(base + vmView(privateId, "bot", bots[0].id, "screen"));
 expect(privateScreenResponse.status).toBe(200); // Browser preview GET has no JSON Content-Type.
 const privateScreen = await privateScreenResponse.json() as any;
 expect(Buffer.from(privateScreen.image.split(",")[1], "base64").toString()).toBe(`vm:${privateId}`);
 const groupScreen = await api(vmView(groupId, "group", group.id, "screen"));
 expect(Buffer.from(groupScreen.image.split(",")[1], "base64").toString()).toBe(`vm:${groupId}`);
 await api(vmView(privateId, "group", group.id, "screen"), "GET", undefined, 403);
 const privateControl = vmView(privateId, "bot", bots[0].id, "control");
 const groupControl = vmView(groupId, "group", group.id, "control");
 const bindingsBeforeViews = (await inventory()).bindings;
 expect(await api(privateControl, "POST", { action: "take", controlLeaseId: "private-preview-lease" })).toMatchObject({ held: true, viewerUrl: expect.stringContaining(encodeURIComponent(`vm:${privateId}`)) });
 expect(await api(groupControl, "POST", { action: "take", controlLeaseId: "group-preview-lease" })).toMatchObject({ held: true, viewerUrl: expect.stringContaining(encodeURIComponent(`vm:${groupId}`)) });
 await api(privateControl, "POST", { action: "take", controlLeaseId: "other-preview-lease" }, 409);
 await api(privateControl, "POST", { action: "release", controlLeaseId: "other-preview-lease" });
 expect(await api(privateControl, "POST", { action: "renew", controlLeaseId: "private-preview-lease" })).toMatchObject({ held: true });
 await action(privateId, "stop", {}, 409);
 await api(groupControl, "POST", { action: "release", controlLeaseId: "group-preview-lease" });
 expect((await inventory()).instances.find((vm: any) => vm.id === privateId).inUse).toBe(true);
 await api(privateControl, "POST", { action: "release", controlLeaseId: "private-preview-lease" });
 expect((await inventory()).bindings).toEqual(bindingsBeforeViews);
 await api(privateControl, "POST", { action: "renew", controlLeaseId: "private-preview-lease" }, 409);

 const discovery = (bot: any, threadId: string) => api(`/api/bots/${bot.id}/computer?threadId=${threadId}`);
 expect((await discovery(bots[0], bots[0].threadId)).vm.id).toBe(privateId);
 expect((await discovery(bots[0], group.threadId)).vm.id).toBe(groupId);
 expect((await discovery(bots[1], group.threadId)).vm.id).toBe(groupId);
 const screen = await api(`/api/bots/${bots[0].id}/local-computer/screenshot?threadId=${group.threadId}`, "POST", {});
 expect(Buffer.from(screen.image.split(",")[1], "base64").toString()).toBe(`vm:${groupId}`);
 // Real group dispatch must mount the same registered target as its preview.
 await api(`/api/groups/${group.id}/messages`, "POST", { text: "Use the assigned desktop" });
 const deadline = Date.now() + 15000; let engine: any;
 while (!engine) { try { if (existsSync(join(data, "engine.json"))) engine = JSON.parse(readFileSync(join(data, "engine.json"), "utf8")); } catch {} if (Date.now() > deadline) throw new Error("Missing engine: " + log); await new Promise(resolve => setTimeout(resolve, 50)); }
 const computer = engine.mcpConfig.mcpServers.computer;
 expect(JSON.stringify(computer)).toContain("openmausbot-computer-vm-");
 const control = await fetch(computer.env.OMB_CONTROL_URL, { headers: { authorization: `Bearer ${computer.env.OMB_CONTROL_TOKEN}` } }); expect(control.status).toBe(200);
 await action(groupId, "stop", {}, 409);
 await bind("group", group.id, "legacy-shared", 409);
 await api(`/api/groups/${group.id}/interrupt`, "POST", {});
 // Allow cleanup to release the exact mounted context.
 for (let i = 0; i < 100; i++) { if (!(await inventory()).instances.find((vm: any) => vm.id === groupId).inUse) break; await new Promise(resolve => setTimeout(resolve, 30)); }
 const sharedId = await create("Shared fixture", { mode: "shared", grants: [{ kind: "bot", id: bots[0].id }, { kind: "bot", id: bots[1].id }] });
 await bind("bot", bots[0].id, sharedId); await bind("bot", bots[1].id, sharedId);
 await bind("group", group.id, sharedId, 403);
 const share = (vmId: string, expected: number) => api(`/api/computer-bindings/group/${group.id}`, "PUT", { vmId, revision: 0, grantGroupAccess: true }, expected);
 await share(sharedId, 409);
 expect((await inventory()).instances.find((vm: any) => vm.id === sharedId).access.grants).toHaveLength(2);
 await api(`/api/computer-bindings/group/${group.id}`, "PUT", { vmId: privateId, revision: (await inventory()).revision, grantGroupAccess: true }, 400);
 const heldGroup = `/api/bots/${bots[0].id}/computer/control?threadId=${group.threadId}`;
 await api(heldGroup, "POST", { action: "take", controlLeaseId: "group-sharing-fixture" });
 await api(`/api/computer-bindings/group/${group.id}`, "PUT", { vmId: sharedId, revision: (await inventory()).revision, grantGroupAccess: true }, 409);
 expect((await inventory()).instances.find((vm: any) => vm.id === sharedId).access.grants).toHaveLength(2);
 await api(heldGroup, "POST", { action: "release", controlLeaseId: "group-sharing-fixture" });
 await api(`/api/computer-bindings/group/${group.id}`, "PUT", { vmId: sharedId, revision: (await inventory()).revision, grantGroupAccess: true });
 expect((await inventory()).instances.find((vm: any) => vm.id === sharedId).access.grants).toEqual([{ kind: "bot", id: bots[0].id }, { kind: "bot", id: bots[1].id }, { kind: "group", id: group.id }]);
 expect((await discovery(bots[0], bots[0].threadId)).vm.id).toBe(sharedId);
 expect((await discovery(bots[1], group.threadId)).vm.id).toBe(sharedId);
 // Holds belong to the VM, and stale viewers cannot release another viewer's lease.
 const desktop = (bot: any, action: string, controlLeaseId: string) => api(`/api/bots/${bot.id}/computer/control?threadId=${bot.threadId}`, "POST", { action, controlLeaseId });
 await api(`/api/bots/${bots[1].id}`, "PATCH", { computer: null });
 const firstLease = "fixture-desktop-first", secondLease = "fixture-desktop-second";
 expect(await desktop(bots[0], "take", firstLease)).toMatchObject({ held: true, owned: true });
 expect(await desktop(bots[1], "take", secondLease)).toMatchObject({ held: true, owned: false });
 await action(sharedId, "stop", {}, 409);
 expect(await desktop(bots[1], "release", secondLease)).toMatchObject({ held: true, released: false });
 expect(await desktop(bots[0], "release", firstLease)).toMatchObject({ held: false, released: true });
 expect(await desktop(bots[1], "take", secondLease)).toMatchObject({ held: true, owned: true });
 expect(await desktop(bots[0], "release", firstLease)).toMatchObject({ held: true, released: false });
 await desktop(bots[1], "release", secondLease);
 await action(sharedId, "reconnect"); expect((await idle(sharedId)).operation.state).toBe("completed");
 await action(sharedId, "stop"); expect((await idle(sharedId)).state).toBe("stopped");
 await action(sharedId, "start"); expect((await idle(sharedId)).state).toBe("running");
 expect(JSON.parse(readFileSync(machineFile, "utf8")).machines[`vm:${sharedId}`].files["/opt/app"]).toBe("installed");
 await api(`/api/groups/${group.id}`, "DELETE");
 expect((await inventory()).instances.some((vm: any) => vm.id === groupId)).toBe(true);
 await api(`/api/bots/${bots[0].id}`, "DELETE");
 expect((await inventory()).instances.find((vm: any) => vm.id === privateId).access.grants).toEqual([]);
}, 45000);

it("lets bots and group members choose permitted VMs and resumes with a fresh connection", async () => {
 await api("/api/vms/limits", "PATCH", { revision: (await inventory()).revision, saved: 12, running: 12 });
 const { bot } = await api("/api/bots", "POST", { name: "VM chooser" });
 await api(`/api/bots/${bot.id}`, "PATCH", { computer: "vm", browser: false, modelSelection: { instanceId: "claude", model: "sonnet" } });
 const { group } = await api("/api/groups", "POST", { name: "VM choices", memberIds: [bot.id], setup: { bulletin: "", defaultResponder: { kind: "member", botId: bot.id } } });
 const first = await create("Chooser first", { mode: "shared", grants: [{ kind: "bot", id: bot.id }, { kind: "group", id: group.id }] });
 const second = await create("Chooser second", { mode: "shared", grants: [{ kind: "bot", id: bot.id }, { kind: "group", id: group.id }] }, false);
 const personal = await create("Chooser private", { mode: "isolated", grants: [{ kind: "bot", id: bot.id }] });
 await bind("bot", bot.id, first); await bind("group", group.id, first);
 const dumpFile = join(data, "engine.json"), finish = join(data, "finish");
 const wait = async <T,>(read: () => T | Promise<T>): Promise<NonNullable<T>> => {
   const end = Date.now() + 15000;
   for (;;) { const value = await read(); if (value) return value as NonNullable<T>; if (Date.now() > end) throw new Error("VM switch timed out: " + log); await new Promise(resolve => setTimeout(resolve, 40)); }
 };
 const dump = () => wait(() => { try { return JSON.parse(readFileSync(dumpFile, "utf8")); } catch { return null; } });
 for (const kind of ["bot", "group"]) {
   rmSync(dumpFile, { force: true }); rmSync(finish, { force: true });
   const threadId = kind === "bot" ? bot.threadId : group.threadId;
   await api(`/api/${kind === "bot" ? "bots" : "groups"}/${kind === "bot" ? bot.id : group.id}/messages`, "POST", { text: "Work on the second named VM" });
   const before = await dump();
   const token = before.mcpConfig.mcpServers.agents.env.OMB_COMMS_TOKEN;
   const select = (body?: unknown) => fetch(base + "/api/internal/computer/select", { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
   const choices = await (await select()).json() as any;
   expect(choices.canSelect).toBe(true);
   expect(choices.vms.map((vm: any) => vm.id)).toEqual(expect.arrayContaining([first, second]));
   expect(choices.vms.some((vm: any) => vm.id === personal)).toBe(kind === "bot");
   if (kind === "group") expect((await select({ vmId: personal })).status).toBe(403);
   expect((await select({ vmId: "unknown-vm" })).status).toBe(403);
   expect(await (await select({ vmId: second })).json()).toMatchObject({ status: "pending", vmId: second });
   expect((await select({ vmId: first })).status).toBe(409);
   const oldControl = before.mcpConfig.mcpServers.computer.env;
   expect((await fetch(oldControl.OMB_CONTROL_URL, { headers: { authorization: `Bearer ${oldControl.OMB_CONTROL_TOKEN}` } })).status).toBe(401);
   rmSync(dumpFile, { force: true }); writeFileSync(finish, "finish");
   const after = await dump();
   expect(JSON.stringify(after.mcpConfig.mcpServers.computer)).toContain(instanceLocalVmTarget(second).containerName);
   expect(after.mcpConfig.mcpServers.agents.env.OMB_COMMS_TOKEN).not.toBe(token);
   await wait(async () => !(await api("/api/bots?messages=0")).bots.find((item: any) => item.id === bot.id).busy);
   const list = await inventory();
   expect(list.bindings).toContainEqual({ kind: "task", id: threadId, vmId: second });
   expect(list.bindings).toContainEqual({ kind, id: kind === "bot" ? bot.id : group.id, vmId: first });
   const preview = await api(`/api/bots/${bot.id}/computer?threadId=${threadId}`);
   expect(preview.vm.id).toBe(second);
   expect((await select()).status).toBe(401);
   // Stop must cancel a requested switch before its next connection is mounted.
   rmSync(dumpFile, { force: true }); rmSync(finish, { force: true });
   const path = `/api/${kind === "bot" ? "bots" : "groups"}/${kind === "bot" ? bot.id : group.id}`;
   await api(path + "/messages", "POST", { text: "Prepare another VM switch" });
   const stopping = await dump();
   const stoppingToken = stopping.mcpConfig.mcpServers.agents.env.OMB_COMMS_TOKEN;
   const pending = await fetch(base + "/api/internal/computer/select", { method: "POST", headers: { authorization: `Bearer ${stoppingToken}`, "content-type": "application/json" }, body: JSON.stringify({ vmId: first }) });
   expect(pending.status).toBe(200);
   await api(path + "/interrupt", "POST", {});
   await wait(async () => !(await api("/api/bots?messages=0")).bots.find((item: any) => item.id === bot.id).busy);
   expect((await inventory()).bindings).toContainEqual({ kind: "task", id: threadId, vmId: second });
 }
 await api(`/api/groups/${group.id}`, "DELETE"); await api(`/api/bots/${bot.id}`, "DELETE");
}, 60000);

it.each([2500, 6000])("waits for a %i ms VM connection without inventing a human takeover", async delay => {
 const { bot } = await api("/api/bots", "POST", { name: `Slow VM ${delay}` });
 await api(`/api/bots/${bot.id}`, "PATCH", { computer: "vm", browser: false, modelSelection: { instanceId: "claude", model: "sonnet" } });
 const vmId = await create(`Slow desktop ${delay}`, { mode: "isolated", grants: [{ kind: "bot", id: bot.id }] });
 await bind("bot", bot.id, vmId);
 const dumpFile = join(data, "engine.json");
 rmSync(dumpFile, { force: true }); rmSync(join(data, "finish"), { force: true });
 try {
  await api(`/api/bots/${bot.id}/messages`, "POST", { text: "Inspect the VM desktop" });
  const deadline = Date.now() + 15000;
  while (!existsSync(dumpFile)) { if (Date.now() > deadline) throw new Error("Missing slow fixture engine"); await new Promise(resolve => setTimeout(resolve, 40)); }
  const engine = JSON.parse(readFileSync(dumpFile, "utf8"));
  const env = engine.mcpConfig.mcpServers.computer.env;
  const state = JSON.parse(readFileSync(machineFile, "utf8")); state.probeDelayMs = delay; writeFileSync(machineFile, JSON.stringify(state));
  const control = createControlClient({ url: env.OMB_CONTROL_URL, token: env.OMB_CONTROL_TOKEN });
  const first = await control.state(true);
  if (delay < 5000) expect(first).toEqual({ held: false, helpOpen: false });
  else {
   expect(first).toMatchObject({ held: true, blockedReason: expect.stringContaining("still preparing") });
   expect(first.blockedReason).not.toMatch(/person|another thread/i);
   await new Promise(resolve => setTimeout(resolve, 1500));
   expect(await control.state(true)).toEqual({ held: false, helpOpen: false });
  }
  // Real human control continues to block actions, and release unblocks them.
  const route = `/api/vms/${vmId}/control?kind=bot&subjectId=${bot.id}`;
  const fastState = JSON.parse(readFileSync(machineFile, "utf8")); delete fastState.probeDelayMs; writeFileSync(machineFile, JSON.stringify(fastState));
  await api(route, "POST", { action: "take", controlLeaseId: "slow-fixture-person-hold" });
  expect(await control.state(true)).toEqual({ held: true, helpOpen: false });
  await api(route, "POST", { action: "release", controlLeaseId: "slow-fixture-person-hold" });
  expect(await control.state(true)).toEqual({ held: false, helpOpen: false });
 } finally {
  const state = JSON.parse(readFileSync(machineFile, "utf8")); delete state.probeDelayMs; writeFileSync(machineFile, JSON.stringify(state));
  await api(`/api/bots/${bot.id}/interrupt`, "POST", {});
  for (let i = 0; i < 100; i++) { if (!(await api("/api/bots?messages=0")).bots.find((b: any) => b.id === bot.id)?.busy) break; await new Promise(resolve => setTimeout(resolve, 30)); }
  await api(`/api/bots/${bot.id}`, "DELETE");
 }
}, 30000);

it("keeps inventory during runtime outage and rejects silent recreation and legacy deletion", async () => {
 const before = await inventory(); const state = JSON.parse(readFileSync(machineFile, "utf8")); state.offline = true; writeFileSync(machineFile, JSON.stringify(state));
 const offline = await inventory(); expect(offline.available).toBe(false); expect(offline.instances).toHaveLength(before.instances.length); expect(offline.instances.every((vm: any) => vm.state === "unknown")).toBe(true);
 state.offline = false; writeFileSync(machineFile, JSON.stringify(state));
 await api("/api/local-computer/remove", "POST", {}, 409);
 await api("/api/config", "PATCH", { localVm: { mode: "per-bot" } }, 409);
 await api("/api/config", "PATCH", { profile: { name: "Fixture owner" } });
 const vm = before.instances.find((vm: any) => vm.name === "Shared fixture"); delete state.machines[`vm:${vm.id}`]; writeFileSync(machineFile, JSON.stringify(state));
 await action(vm.id, "start"); expect((await idle(vm.id)).operation.error).toMatch(/missing/);
 expect(JSON.parse(readFileSync(machineFile, "utf8")).machines[`vm:${vm.id}`]).toBeUndefined();
 await action(vm.id, "delete", { confirmName: "wrong" }, 400);
 await action(vm.id, "delete", { confirmName: vm.name }); expect(await idle(vm.id)).toBeUndefined();
}, 15000);


it("recreates the retained disk without changing assignments, refuses occupied VMs, and preserves power state", async () => {
 const state = JSON.parse(readFileSync(machineFile, "utf8")); state.runtime = "docker"; writeFileSync(machineFile, JSON.stringify(state));
 const id = await create("Retained disk fixture", { mode: "shared", grants: [], allBots: true });
 const { bot } = await api("/api/bots", "POST", { name: "Retained disk user" });
 await bind("bot", bot.id, id);
 const before = await inventory();
 expect(before.instances.find((vm: any) => vm.id === id).canRecreate).toBe(true);
 const route = `/api/vms/${id}/control?kind=bot&subjectId=${bot.id}`;
 await api(route, "POST", { action: "take", controlLeaseId: "recreation-held-fixture" });
 await action(id, "recreate", {}, 409);
 await api(route, "POST", { action: "release", controlLeaseId: "recreation-held-fixture" });
 const operation = await action(id, "recreate");
 expect(await idle(id)).toMatchObject({ state: "running", operation: { state: "completed" } });
 const machine = () => JSON.parse(readFileSync(machineFile, "utf8")).machines[`vm:${id}`];
 expect(machine()).toMatchObject({ generation: 1, files: { "/opt/app": "installed", "/home/cua/workspace/file": "retained" } });
 expect((await inventory()).bindings).toEqual(before.bindings);
 await api(`/api/vms/${id}/actions`, "POST", { action: "recreate", revision: 0, requestId: operation.operation.requestId }, 202);
 expect(machine().generation).toBe(1); // retries never recreate twice
 await action(id, "stop"); await idle(id);
 await action(id, "recreate");
 expect(await idle(id)).toMatchObject({ state: "stopped", operation: { state: "completed" } });
 expect(machine().generation).toBe(2);
 await action(id, "start"); await idle(id);
 const failing = JSON.parse(readFileSync(machineFile, "utf8")); failing.recreateFailure = true; writeFileSync(machineFile, JSON.stringify(failing));
 await action(id, "recreate");
 expect(await idle(id)).toMatchObject({ state: "running", operation: { state: "failed", error: "Fixture snapshot failed" } });
 expect(machine().generation).toBe(2);
 const missing = JSON.parse(readFileSync(machineFile, "utf8")); delete missing.machines[`vm:${id}`]; delete missing.recreateFailure; writeFileSync(machineFile, JSON.stringify(missing));
 await action(id, "recreate"); expect((await idle(id)).operation.error).toContain("never be replaced with a blank one");
 expect(machine()).toBeUndefined();
}, 20000);


it("VM registration reuses the mounted control credential across failed and successful probes", async () => {
 const machines = JSON.parse(readFileSync(machineFile, "utf8"));
 writeFileSync(machineFile, JSON.stringify({ ...machines, mcpProbe: true }));
 const { bot } = await api("/api/bots", "POST", { name: "VM registrar" });
 await api(`/api/bots/${bot.id}`, "PATCH", { computer: "vm", browser: false, modelSelection: { instanceId: "claude", model: "sonnet" } });
 const { group } = await api("/api/groups", "POST", { name: "Registration group", memberIds: [bot.id], setup: { bulletin: "", defaultResponder: { kind: "member", botId: bot.id } } });
 const vmId = await create("Registration VM", { mode: "shared", grants: [{ kind: "bot", id: bot.id }, { kind: "group", id: group.id }] });
 await bind("bot", bot.id, vmId); await bind("group", group.id, vmId);
 const dumpFile = join(data, "engine.json"), finish = join(data, "finish");
 const dump = () => { try { return JSON.parse(readFileSync(dumpFile, "utf8")); } catch { return null; } };
 try {
  for (const kind of ["bot", "group"]) {
   rmSync(dumpFile, { force: true }); rmSync(finish, { force: true });
   const threadId = kind === "bot" ? bot.threadId : group.threadId;
   await api(`/api/${kind === "bot" ? "bots" : "groups"}/${kind === "bot" ? bot.id : group.id}/messages`, "POST", { text: "Register the installed VM tools" });
   await expect.poll(() => dump(), { timeout: 15000 }).toBeTruthy();
   const before = dump(), agentToken = before.mcpConfig.mcpServers.agents.env.OMB_COMMS_TOKEN;
   const computer = before.mcpConfig.mcpServers.computer.env;
   const originalToken = readFileSync(computer.OMB_CONTROL_TOKEN_FILE, "utf8");
   const register = async (name: string, command: string) => {
    const pending = fetch(base + "/api/internal/mcp/servers", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${agentToken}` }, body: JSON.stringify({ name, command, vmId }) });
    let card: any;
    await expect.poll(async () => {
     const messages = (await api(`/api/threads/${threadId}/messages?limit=50`)).messages;
     card = messages.find((m: any) => m.card?.tool === "register_mcp_server" && m.card?.title.includes(name))?.card;
     return Boolean(card);
    }, { timeout: 10000 }).toBe(true);
    await api(`/api/threads/${threadId}/respond`, "POST", { requestId: card.requestId, behavior: "allow" });
    const response = await pending; return { status: response.status, body: await response.json() };
   };
   // First registration is the first computer action: direct turns must be
   // able to acquire their lazy claim before executing the guest MCP.
   expect((await register(`failed-${kind}`, "fixture-fail")).status).toBe(422);
   expect(readFileSync(computer.OMB_CONTROL_TOKEN_FILE, "utf8")).toBe(originalToken);
   const control = () => fetch(computer.OMB_CONTROL_URL, { headers: { "content-type": "application/json", authorization: `Bearer ${originalToken.trim()}` } });
   expect(await (await control()).json()).toMatchObject({ held: false });
   expect(await register(`registered-${kind}`, "fixture-server")).toMatchObject({ status: 201, body: { activation: "resume_after_turn", tools: [{ name: "read_notes" }] } });
   expect(readFileSync(computer.OMB_CONTROL_TOKEN_FILE, "utf8")).toBe(originalToken);
   expect((await control()).status).toBe(200);
   writeFileSync(finish, "finish");
   await expect.poll(() => dump()?.pid, { timeout: 15000 }).not.toBe(before.pid);
   expect(JSON.parse(dump().mcpConfig.mcpServers[`registered-${kind}`].env.OMB_GATE_UPSTREAM).env.OMB_VM_MCP_SPEC).toBeTruthy();
   await expect.poll(async () => (await api("/api/bots?messages=0")).bots.find((b: any) => b.id === bot.id).busy, { timeout: 15000 }).toBe(false);
   expect((await control()).status).toBe(401);
  }
 } finally {
  const current = JSON.parse(readFileSync(machineFile, "utf8")); delete current.mcpProbe;
  writeFileSync(machineFile, JSON.stringify(current));
 }
}, 60000);

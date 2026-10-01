// Explicit opt-in: one disposable Docker VM and one isolated production server.
import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { containerComputerMcp, containerRunArgs, type LocalVmTarget } from "../server/container-computer.ts";
import { registeredVmMcpLaunch, namespacedRegisteredVmMcp } from "../server/registered-mcp.ts";
import { probeMcpServer } from "../server/mcp-probe.ts";
import { waitForExit } from "../server/testing/cleanup.ts";
import { launchVerificationServer, runControlOmb } from "./control-omb.ts";

if (process.argv[2] !== "--docker") throw new Error("Pass --docker to launch an isolated fixture VM");
const exec = promisify(execFile);
const docker = async (...args: string[]) => (await exec("docker", args, { timeout: 60000 })).stdout.trim();
const workspace = await mkdtemp(join(tmpdir(), "omb-mcp-vm-"));
const target: LocalVmTarget = { key: "mcp-fixture", label: "MCP fixture", containerName: `omb-mcp-${randomUUID()}`, workspaceDir: workspace, viewerPort: null };
const fixture = await launchVerificationServer();
let held = false;
const token = randomUUID();
const gate = createServer((req, res) => {
  res.writeHead(req.headers.authorization === `Bearer ${token}` ? 200 : 401, { "content-type": "application/json" });
  res.end(JSON.stringify({ held, helpOpen: false }));
});
await new Promise<void>(resolve => gate.listen(0, "127.0.0.1", resolve));
const address = gate.address();
assert(address && typeof address !== "string");
const evidence: unknown[] = [{ fixture: fixture.info }];
let created = false, child: ChildProcess | undefined;
try {
  evidence.push({ doctor: await runControlOmb(["doctor", "--url", fixture.info.url]) });
  await writeFile(join(workspace, "fixture.py"), `import json,sys,os
for line in sys.stdin:
 f=json.loads(line); method=f.get('method'); result=None
 if method=='initialize': result={'protocolVersion':'2025-06-18','capabilities':{'tools':{}},'serverInfo':{'name':'vm-fixture','version':'1'}}
 if method=='tools/list': result={'tools':[{'name':'read_fixture','description':'Read fixture data','inputSchema':{'type':'object','properties':{}}}]}
 if method=='tools/call':
  with open('/tmp/mcp-fixture-called','a') as marker: marker.write('called\\n')
  result={'content':[{'type':'text','text':json.dumps({'uid':os.getuid(),'cwd':os.getcwd(),'guestEnv':os.environ.get('FIXTURE_TOKEN'),'guestNode':os.environ.get('NODE_OPTIONS')})}]}
 if result is not None: print(json.dumps({'jsonrpc':'2.0','id':f['id'],'result':result}),flush=True)
`);
  await docker(...containerRunArgs("docker", randomUUID(), target)); created = true;
  const spec = registeredVmMcpLaunch({ command: "/usr/bin/python3", args: ["/home/cua/workspace/fixture.py"], env: { FIXTURE_TOKEN: "guest-value", NODE_OPTIONS: "--this-must-never-reach-host-node" } },
    containerComputerMcp("docker", { url: `http://127.0.0.1:${address.port}`, token }, target));
  assert.equal((await probeMcpServer({ ...spec, enabled: true })).ok, true);
  const codexSpec = namespacedRegisteredVmMcp(spec, "fixture-tools");
  assert.equal((await probeMcpServer({ ...codexSpec, enabled: true })).ok, true);
  evidence.push({ discovery: "passed", codexPayloadDiscovery: "passed" });
  child = spawn(spec.command, spec.args, { env: { ...process.env, ...spec.env }, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map<number, (value: any) => void>();
  const lines = createInterface({ input: child.stdout! });
  lines.on("line", line => { const frame = JSON.parse(line); pending.get(frame.id)?.(frame); pending.delete(frame.id); });
  let id = 0;
  const rpc = (method: string, params?: unknown) => new Promise<any>((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(key, value => { clearTimeout(timer); resolve(value); });
    child!.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: key, method, ...(params ? { params } : {}) }) + "\n");
  });
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fixture", version: "1" } });
  const result = await rpc("tools/call", { name: "read_fixture", arguments: {} });
  assert.deepEqual(JSON.parse(result.result.content[0].text), { uid: 1000, cwd: "/home/cua/workspace", guestEnv: "guest-value", guestNode: "--this-must-never-reach-host-node" });
  held = true;
  const refused = await rpc("tools/call", { name: "read_fixture", arguments: {} });
  assert.equal(refused.result.isError, true);
  assert.equal(await docker("exec", target.containerName, "cat", "/tmp/mcp-fixture-called"), "called");
  assert.equal((await probeMcpServer({ ...spec, enabled: true })).ok, false);
  assert.equal((await probeMcpServer({ ...codexSpec, enabled: true })).ok, false);
  evidence.push({ guestExecution: "passed", guestEnvironmentIsolation: "passed", heldToolCall: "blocked", heldStartup: "blocked" });
  console.info(JSON.stringify(evidence.at(-1)));
} finally {
  await waitForExit(child, { signal: "SIGTERM" });
  if (created) await docker("rm", "-f", target.containerName);
  await new Promise<void>(resolve => gate.close(() => resolve()));
  await fixture.close();
  await rm(workspace, { recursive: true, force: true });
  const evidencePath = `${fixture.info.logPath}.vm-mcp.json`;
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.info(JSON.stringify({ evidencePath, fixtureRemoved: true }));
}

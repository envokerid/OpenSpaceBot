// A real isolated harness and companion; only the container executable is fake.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { launchVerificationServer, runControlOmb } from '../../scripts/control-omb.ts';
import { captureComputer } from '../src/core/computer.ts';
import { Client, pair } from '../src/core/client.ts';
import { manualInvite } from '../src/core/pairing.ts';

const scratch = mkdtempSync(join(tmpdir(), 'omb-expo-computer-'));
const bin = join(scratch, 'bin'); mkdirSync(bin);
const root = fileURLToPath(new URL('../..', import.meta.url));
// A valid image large enough for the server's wholeScreenshot check.
const image = readFileSync(join(root, 'docs/screenshots/ubuntu-computer-panel.png')).toString('base64');
writeFileSync(join(scratch, 'screen.b64'), image);
writeFileSync(join(bin, 'docker'), `#!${process.execPath}
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import * as c from ${JSON.stringify(pathToFileURL(join(root, 'server/container-computer.ts')).href)};
const args = process.argv.slice(2); const cmd = args.join(' ');
appendFileSync(${JSON.stringify(join(scratch, 'runtime.log'))}, cmd + '\\n');
const labels = { [c.MANAGED_LABEL]: '1', [c.DRIVER_LABEL]: c.CUA_DRIVER_VERSION, [c.BASE_IMAGE_LABEL]: c.BASE_IMAGE_DIGEST, [c.IMAGE_LAYER_LABEL]: c.IMAGE_LAYER_VERSION, [c.WORKSPACE_LABEL]: '1' };
if (args[0] === 'info') console.log('fixture');
else if (args[0] === 'image' && args[1] === 'inspect') console.log(JSON.stringify([{ Id:'sha256:fixture', Config:{ Labels:labels } }]));
else if (args[0] === 'inspect') console.log(JSON.stringify([{ Config:{Image:c.IMAGE, Labels:labels}, State:{Running:true}, Image:'sha256:fixture', HostConfig:{Memory:4294967296,MemorySwap:4294967296,NanoCpus:2000000000,PidsLimit:512,CapDrop:['ALL'],CapAdd:['CAP_SETUID','CAP_SETGID'],Privileged:false,IpcMode:'private',CgroupnsMode:'private',ShmSize:536870912,RestartPolicy:{Name:'no',MaximumRetryCount:0},PortBindings:{'6901/tcp':[{HostIp:'127.0.0.1'}]}},Mounts:[{Type:'bind',Source:c.VM_WORKSPACE_DIR,Destination:c.VM_WORKSPACE_GUEST,RW:true}]}]));
else if (args[0] === 'exec' && args.includes('base64')) {
 if (existsSync(${JSON.stringify(join(scratch, 'fail'))})) { console.error('Fixture VM capture unavailable'); process.exit(1); }
 console.log(readFileSync(${JSON.stringify(join(scratch, 'screen.b64'))}, 'utf8'));
}
else if (args[0] === 'exec' && args.includes('--version')) console.log('cua-driver ' + c.CUA_DRIVER_VERSION);
else if (args[0] === 'exec' && args.includes('health_report')) console.log(JSON.stringify({schema_version:'1',overall:'ok',checks:[]}));
else if (args[0] === 'exec' && (args.includes('status') || args.includes('get_desktop_state'))) console.log('{}');
else { console.error('Unexpected fixture command: ' + cmd); process.exit(1); }
`, { mode: 0o700 });
// Shadow every runtime candidate so the fixture never probes a real daemon.
writeFileSync(join(bin, 'podman'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
const fixture = await launchVerificationServer(process.env, undefined, { binDir: bin, host: 'ssh://fixture@127.0.0.1:1', sshKey: join(scratch, 'unused-key'), staticDir: scratch });
process.env.OMB_COMPANION_DIR = join(fixture.info.dataDir, 'companion');
const { DeviceRegistry } = await import('../../companion/src/devices.ts');
const { createProxyHandler } = await import('../../companion/src/proxy.ts');
const registry = new DeviceRegistry();
const sidecar = createServer(createProxyHandler({ harnessPort: Number(new URL(fixture.info.url).port), authenticate: value => registry.authenticate(value), redeem: (code, name, requestId) => registry.redeem(code, name, requestId), serverName: () => 'VM preview fixture' }));
const evidence: unknown[] = [{ fixture: fixture.info, scratch }];
const control = async (args: string[]) => { const result = await runControlOmb([...args, '--url', fixture.info.url]); evidence.push({ command: args, result }); return result as any; };
try {
 sidecar.listen(0, '127.0.0.1'); await once(sidecar, 'listening');
 const address = sidecar.address(); assert.ok(address && typeof address !== 'string');
 const origin = `http://127.0.0.1:${address.port}`;
 const window = registry.openPairing();
 const paired = await pair(manualInvite(origin, window.code), 'VM fixture', 'fixture-pair');
 const client = new Client(paired.connection, paired.token);
 const created = await control(['new-bot', '--name', 'VM Preview']);
 const bot = (await client.fleet()).bots.find(item => item.id === created.bot.id)!;
 const api = async (path: string, method: string, body: unknown) => {
  const response = await fetch(fixture.info.url + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.ok(response.ok, await response.clone().text()); return response.json() as Promise<any>;
 };
 await api(`/api/bots/${bot.id}`, 'PATCH', { computer: 'vm' });
 const first = { kind: 'bots' as const, id: bot.id, threadId: bot.threadId };
 const sibling = await client.createTask(first, 'Phone VM');
 const phoneThread = sibling.bot!.threadId;
 await client.task(first, 'POST');
 const frame = await captureComputer(client, bot.id, phoneThread, new AbortController().signal);
 assert.equal(frame.surface, 'vm'); assert.equal(frame.uri, `data:image/png;base64,${image}`);
 assert.ok(!(await client.fleet()).bots.find(item => item.id === bot.id)!.busy);
 assert.equal((await client.fleet()).bots.find(item => item.id === bot.id)!.threadId, first.threadId);
 evidence.push({ action: 'open idle VM from phone sibling through authenticated companion', surface: frame.surface, imageBytes: Buffer.from(image, 'base64').length, desktopThreadUnchanged: true });
 await fetch(`${fixture.info.url}/api/bots/${bot.id}/local-computer`).then(response => { assert.ok(response.ok); });
 await api(`/api/bots/${bot.id}`, 'PATCH', { computer: null });
 assert.equal((await captureComputer(client, bot.id, phoneThread, new AbortController().signal)).surface, 'vm');
 evidence.push({ action: 'Auto discovers the existing idle VM', status: 'passed' });
 // The explicit VM result above is the primary regression; the selected task
 // and invalid task guard must also survive the proxy boundary.
 await assert.rejects(captureComputer(client, bot.id, 'missing-thread', new AbortController().signal), /task/);
 for (const path of ['/api/local-computer/screenshot', `/api/bots/${bot.id}/local-computer/run`, `/api/bots/${bot.id}/local-computer/remove`]) await assert.rejects(client.request(path, 'POST', {}), /computer|available|allowed|phone|403|404|route/i);
 await api(`/api/bots/${bot.id}`, 'PATCH', { computer: 'vm' });
 writeFileSync(join(scratch, 'fail'), '');
 await assert.rejects(captureComputer(client, bot.id, phoneThread, new AbortController().signal));
 rmSync(join(scratch, 'fail'));
 assert.ok((await captureComputer(client, bot.id, phoneThread, new AbortController().signal)).uri);
 evidence.push({ action: 'capture failure, recovery, unknown-thread and forbidden lifecycle checks', status: 'passed' });
 await control(['messages', '--bot', bot.id, '--task', phoneThread, '--limit', '5']);
 writeFileSync(fixture.info.logPath + '.computer.json', JSON.stringify(evidence, null, 2));
 console.log(JSON.stringify({ status: 'passed', evidence: fixture.info.logPath + '.computer.json', scratch, origin, botId: bot.id, threadId: phoneThread }));
 if (process.argv.includes('--interactive')) {
  const printPair = () => console.log(JSON.stringify({ origin, code: registry.openPairing().code }));
  printPair();
  const input = createInterface({ input: process.stdin }); input.on('line', line => { if (line.trim() === 'pair') printPair(); });
  await new Promise<void>(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  input.close();
 }
} finally {
 sidecar.closeAllConnections(); await new Promise<void>(resolve => sidecar.close(() => resolve()));
 await fixture.close();
 if (existsSync(join(scratch, 'fail'))) rmSync(join(scratch, 'fail'));
}

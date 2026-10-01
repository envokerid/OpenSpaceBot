// VM-library integration fixture. The real server, store, auth and client run;
// only the container boundary is replaced with isolated on-disk machines.
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
const file = process.env.OMB_VM_LIBRARY_FIXTURE;
if (!file || !process.env.OMB_DATA_DIR || !file.startsWith(process.env.OMB_DATA_DIR + '/')) throw new Error('An isolated VM fixture is required');
const actual = new URL('../container-computer.ts?actual', import.meta.url).href;
const mock = new URL('./vm-library-mock.mjs', import.meta.url).href;
registerHooks({
 resolve(specifier, context, next) { return specifier.endsWith('/container-computer.ts') ? { url: mock, shortCircuit: true } : next(specifier, context); },
 load(url, context, next) {
  if (url !== mock) return next(url, context);
  return { format: 'module', shortCircuit: true, source: `
   export * from ${JSON.stringify(actual)};
   import { containerComputerMcp as actualMcp } from ${JSON.stringify(actual)};
   import { readFileSync, writeFileSync } from 'node:fs';
   const file = ${JSON.stringify(file)};
   const read = () => JSON.parse(readFileSync(file, 'utf8'));
   const save = value => writeFileSync(file, JSON.stringify(value));
   export function containerComputerMcp(...args) {
    const spec = actualMcp(...args);
    return read().mcpProbe ? { ...spec, args: [${JSON.stringify(fileURLToPath(new URL('./vm-registration-mcp.ts', import.meta.url)))}], env: { ...spec.env, OMB_VM_LIBRARY_FIXTURE: file } } : spec;
   }
   export async function containerRuntimeStatus() { return { runtime: read().runtime ?? 'podman', daemonUp: !read().offline }; }
   export async function containerComputerExists(runtime, target) { return !!read().machines[target.key]; }
   export async function containerComputerStatus(runner, platform, target = { key: 'shared' }, options = {}) {
    const data = read(); const machine = data.machines[target.key];
    if (options.probeDesktop !== false && data.probeDelayMs) await new Promise(resolve => setTimeout(resolve, data.probeDelayMs));
    return { viewer_url: 'http://127.0.0.1:16080/vnc.html#fixture=' + encodeURIComponent(target.key), runtime: data.runtime ?? 'podman', daemonUp: !data.offline, image: true, managed: !!machine, imageMatches: !!machine, network: 'loopback', security: 'hardened', persistence: 'durable', container: machine?.state ?? 'missing', ready: machine?.state === 'running' && !data.offline && options.probeDesktop !== false, problem: data.offline ? 'Runtime offline' : options.probeDesktop === false && machine?.state === 'running' ? 'The Local VM started, but Cua Driver is not ready yet' : null, create_supported: true };
   }
   export async function containerComputerAction(action, runner, platform, target = { key: 'shared' }) {
    const data = read(); if(data.offline) throw Error('Runtime offline');
    if(action === 'run') { if(data.machines[target.key]) throw Error('Already exists'); data.machines[target.key] = { state: 'running', files: { '/opt/app': 'installed', '/home/cua/workspace/file': 'retained' } }; }
    else if(action === 'start') { if(!data.machines[target.key]) throw Error('Missing'); data.machines[target.key].state = 'running'; }
    else if(action === 'stop') data.machines[target.key].state = 'stopped';
    else if(action === 'remove') delete data.machines[target.key];
    data.actions.push({ action, target: target.key }); save(data);
    return containerComputerStatus(runner, platform, target);
   }
   export async function recreateDockerVmPreservingDisk(target) {
    const data = read(); const machine = data.machines[target.key];
    if (!machine || machine.state !== 'stopped') throw Error('Expected stopped disk');
    if (data.recreateFailure) throw Error('Fixture snapshot failed');
    data.machines[target.key] = { ...machine, state: 'running', generation: (machine.generation ?? 0) + 1 };
    data.actions.push({ action: 'recreate', target: target.key }); save(data);
    return { backupContainer: 'fixture-backup', snapshotImage: 'fixture-snapshot' };
   }
   export async function containerComputerScreenshot(runner, platform, target = { key: 'shared' }) { return 'data:image/png;base64,' + Buffer.from(target.key).toString('base64'); }
   export async function containerComputerFrame(runner, platform, target = { key: 'shared' }) { return { png: Buffer.from(target.key).toString('base64'), format: 'png' }; }
   export async function containerComputerInput(input, target, check) { check(); const data=read(); data.actions.push({ input, target: target.key }); save(data); }
  ` };
 },
});

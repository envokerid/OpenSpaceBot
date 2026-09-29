// Only the disposable mobile VM HTTP fixture imports this module. No real
// container daemon, desktop, or input device is reached.
import { registerHooks } from 'node:module';
const file = process.env.OMB_MOBILE_VM_INPUTS;
if (!file || !process.env.OMB_DATA_DIR || !file.startsWith(process.env.OMB_DATA_DIR + '/')) throw new Error('An isolated VM fixture is required');
const actual = new URL('../container-computer.ts?actual', import.meta.url).href;
const mock = new URL('./mobile-vm-mock.mjs', import.meta.url).href;
registerHooks({
 resolve(specifier, context, next) { return specifier.endsWith('/container-computer.ts') ? { url: mock, shortCircuit: true } : next(specifier, context); },
 load(url, context, next) {
  if (url !== mock) return next(url, context);
  return { format: 'module', shortCircuit: true, source: `
   export * from ${JSON.stringify(actual)};
   import { appendFileSync } from 'node:fs';
   export async function containerRuntimeStatus() { return { runtime: 'podman', daemonUp: true }; }
   export async function containerComputerExists() { return true; }
   export async function containerComputerAction() { throw new Error('VM lifecycle is forbidden in this fixture'); }
   export async function containerComputerFrame() { return { png: 'aW5wdXQtZml4dHVyZQ==', format: 'png' }; }
   export async function containerComputerScreenshot() { return 'data:image/png;base64,aW5wdXQtZml4dHVyZQ=='; }
   export async function containerComputerStatus() { return { runtime: 'podman', daemonUp: true, image: true, managed: true, imageMatches: true, network: 'loopback', security: 'hardened', persistence: 'durable', container: 'running', ready: true, problem: null }; }
   export async function containerComputerInput(input, target, check) { check(); appendFileSync(${JSON.stringify(file)}, JSON.stringify({ input, target: target.key }) + '\\n'); }
  ` };
 },
});

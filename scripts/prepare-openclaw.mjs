// Stage a complete pinned OpenClaw installation outside ASAR, plus real Node.
// The plugin SDK is loaded only by OpenClaw; it is never bundled into the app.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { x } from 'tar';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = '24.16.0';
const digests = {
  'darwin-arm64': '39189dab4eeb15706c424af0ac08a3044c9e48f7db12a7d77f6b7aafc7dd5df6',
  'darwin-x64': '298b4c7b3cb80765c8703e42b90324a4ece3b6634947b89e769c3c980ab55185',
  'linux-arm64': '589f5b6dd4fcfee4dfda73013903c966abaa8abd93dbc9d436544e472b4f0e74',
  'linux-x64': '2faf6a387e9b62b888e21c54f01249fb27537ffecf1842f29f4c919d0a59a0ff',
  'win32-x64': 'b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3',
};
const targets = process.argv.includes('--current') ? [process.arch] : process.platform === 'darwin' ? ['arm64', 'x64'] : [process.arch];
for (const arch of targets) {
  const target = `${process.platform}-${arch}`;
  const digest = digests[target];
  if (!digest) throw new Error(`Unsupported OpenClaw runtime target: ${target}`);
  const out = join(root, 'dist-native', 'openclaw', target);
  // pnpm deploy retains a self-contained node_modules graph, including the
  // optional platform binaries installed via supportedArchitectures.
  rmSync(out, { recursive: true, force: true });
  const pnpm = process.env.npm_execpath;
  if (!pnpm || !existsSync(pnpm)) throw new Error('Run this script via pnpm build:openclaw');
  const deployed = spawnSync(process.execPath, [pnpm, '--filter', '@openmausbot/openclaw-runtime', 'deploy', '--prod', '--legacy', out], { cwd: root, stdio: 'inherit' });
  if (deployed.status !== 0) throw new Error('OpenClaw deployment failed');
  const filename = process.platform === 'win32' ? `win-${arch}/node.exe` : `node-v${version}-${process.platform}-${arch}.tar.gz`;
  const cache = join(root, 'dist-native', 'cache', filename.replaceAll('/', '-'));
  mkdirSync(dirname(cache), { recursive: true });
  let bytes;
  if (existsSync(cache)) bytes = readFileSync(cache);
  else {
    const response = await fetch(`https://nodejs.org/dist/v${version}/${filename}`, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`Node download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Node checksum mismatch');
  writeFileSync(cache, bytes);
  if (process.platform === 'win32') writeFileSync(join(out, 'node.exe'), bytes);
  else {
    const archive = join(out, 'node.tar.gz');
    writeFileSync(archive, bytes);
    await x({ file: archive, cwd: out, strip: 1, filter: path => /\/(bin\/node|LICENSE)$/.test(path) });
    rmSync(archive);
    chmodSync(join(out, 'bin/node'), 0o755);
    copyFileSync(join(out, 'LICENSE'), join(out, 'Node-LICENSE.txt'));
    rmSync(join(out, 'LICENSE'));
  }
  const installed = JSON.parse(readFileSync(join(out, 'node_modules/openclaw/package.json'), 'utf8'));
  if (installed.version !== '2026.9.6') throw new Error('Unexpected OpenClaw version');
  mkdirSync(join(out, 'licenses'), { recursive: true });
  copyFileSync(join(out, 'node_modules/openclaw/LICENSE'), join(out, 'licenses/OpenClaw-LICENSE.txt'));
  // On Windows the standalone binary does not contain the license. The
  // installed Node distribution's license must be included by the builder.
  if (process.platform === 'win32') {
    copyFileSync(join(root, 'third_party/node/LICENSE'), join(out, 'Node-LICENSE.txt'));
  }
  console.log(`OpenClaw ${installed.version} and Node ${version}: ${out}`);
}

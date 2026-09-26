// Render actual Expo components with synthetic data in an owned browser/profile.
// No live server URL, saved connection, provider account or mobile device is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { resolveAgentBrowserBinary } from "../../server/browser-engine.ts";
import { installedChrome, sessionEnv, UI_TOOLS_DIR } from "../../scripts/testing/control-omb-ui.ts";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "omb-usage-ui-"));
const evidenceDir = mkdtempSync(join(tmpdir(), "omb-usage-ui-evidence-"));
const binary = resolveAgentBrowserBinary({ dataDir: UI_TOOLS_DIR, env: process.env });
const chrome = process.env.AGENT_BROWSER_EXECUTABLE_PATH ?? installedChrome() ?? (existsSync("/usr/bin/brave-browser") ? "/usr/bin/brave-browser" : null);
assert.ok(binary && chrome, "Install the control-omb UI tools before running this check");
mkdirSync(join(root, "tmp"));
let executable = chrome;
if (process.platform === "linux") {
  executable = join(root, "chrome");
  writeFileSync(executable, `#!/bin/sh\nexec '${chrome.replaceAll("'", "'\\''")}' --no-sandbox "$@"\n`, { mode: 0o700 });
}
const env = sessionEnv({ home: root, session: `usage-ui-${Date.now()}`, chrome: executable });
const evidence = [];
async function browser(...args) {
  const child = spawn(binary, [...args, "--json"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { errors += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), 45_000);
  let status;
  try { status = await new Promise((done, fail) => { child.on("error", fail); child.on("close", done); }); }
  finally { clearTimeout(timer); }
  assert.equal(status, 0, `${args[0]}: ${errors || output}`);
  const parsed = JSON.parse(output);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error));
  evidence.push({ command: args, result: parsed.data });
  return parsed.data;
}

const extensions = [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".mjs", ".js", ".ts", ".tsx", ".json"];
const module = name => resolve(repo, "expo/node_modules", name);
writeFileSync(join(root, "index.html"), `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style>html,body,#root{margin:0;min-height:100%;font-family:system-ui}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/@fs/${repo}/expo/scripts/fixtures/usage-stats.tsx"></script></body></html>`);
const server = await createServer({ configFile: false, root,
  resolve: { extensions, alias: [
    { find: /^react-native$/, replacement: module("react-native-web") },
    { find: /^react-native-web$/, replacement: module("react-native-web") },
    { find: /^react$/, replacement: module("react") },
    { find: /^react\/(.*)$/, replacement: module("react") + "/$1" },
    { find: /^react-dom$/, replacement: module("react-dom") },
    { find: /^react-dom\/(.*)$/, replacement: module("react-dom") + "/$1" },
    { find: "react-native-safe-area-context", replacement: module("react-native-safe-area-context") },
    { find: "react-native-svg", replacement: module("react-native-svg/lib/module/ReactNativeSVG.web.js") },
  ] }, server: { host: "127.0.0.1", port: 0, fs: { allow: [root, repo] } },
  define: { __DEV__: "true", "process.env.NODE_ENV": '"development"' },
  optimizeDeps: { esbuildOptions: { resolveExtensions: extensions }, include: ["react", "react-dom/client", "react-native-web"] },
});
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  await browser("open", url);
  await browser("set", "viewport", "390", "844");
  await browser("set", "media", "light");
  await browser("wait", "[aria-label='This month']");
  let snapshot = await browser("snapshot");
  assert.match(snapshot.snapshot, /81\.4%/);
  assert.match(snapshot.snapshot, /98\.3%/);
  await browser("screenshot", join(evidenceDir, "light.png"), "--full");
  const click = async name => {
    const refs = (await browser("snapshot")).refs;
    const ref = Object.entries(refs).find(([, value]) => value.name.startsWith(name));
    assert.ok(ref, name);
    await browser("click", "@" + ref[0]);
  };
  await click("Research & strategy");
  snapshot = await browser("snapshot");
  assert.match(snapshot.snapshot, /820,000/);
  assert.match(snapshot.snapshot, /Recorded uncached input/);
  await browser("set", "media", "dark");
  await browser("screenshot", join(evidenceDir, "dark-expanded.png"), "--full");
  await click("Model");
  assert.match((await browser("snapshot")).snapshot, /claude-sonnet-5/);
  await click("Last month");
  assert.match((await browser("snapshot")).snapshot, /2026-08-01 – 2026-08-31/);
  await browser("open", url + "?mode=unknown");
  await browser("wait", "[aria-label='This month']");
  await browser("set", "viewport", "320", "760");
  snapshot = await browser("snapshot");
  assert.match(snapshot.snapshot, /Unknown/);
  assert.equal((await browser("eval", "document.body.scrollWidth <= innerWidth")).result, true);
  await browser("screenshot", join(evidenceDir, "unknown-320.png"), "--full");
  await browser("open", url + "?mode=empty");
  await browser("wait", "[aria-label='This month']");
  assert.match((await browser("snapshot")).snapshot, /No activity in this period/);
  await browser("screenshot", join(evidenceDir, "empty.png"), "--full");
} finally {
  writeFileSync(join(evidenceDir, "actions.json"), JSON.stringify(evidence, null, 2));
  try { await browser("close"); } finally { await server.close(); rmSync(root, { recursive: true, force: true }); }
  console.log("Expo usage UI evidence:", evidenceDir);
}

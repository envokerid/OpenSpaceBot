#!/usr/bin/env -S node --experimental-strip-types
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { hash, loadExperiment, trialOrder } from "./benchmarks/chat/schema.ts";
import { compareResults, readResults } from "./benchmarks/chat/report.ts";
import { runExperiment } from "./benchmarks/chat/runner.ts";
import type { ProviderOptions } from "./benchmarks/chat/provider.ts";

const help = `Chat mechanics benchmark — isolated single-bot conversations

pnpm bench:chat validate benchmarks/chat/experiments/memory.yaml
pnpm bench:chat run benchmarks/chat/experiments/smoke.yaml --fake
pnpm bench:chat run benchmarks/chat/experiments/memory.yaml --live --model MODEL
pnpm bench:chat run EXPERIMENT --live --engine openai-compatible --base-url URL --model MODEL --api-key-env NAME
pnpm bench:chat compare BEFORE_DIRECTORY AFTER_DIRECTORY [--out FILE.md]

run options: --scenario ID_OR_CATEGORY --repetitions N --out NEW_DIRECTORY
native live auth: --auth-home DIRECTORY (default ~/.codex; reads only existing access token)
Exactly one of --fake or --live is required. Fake scores never measure model quality.
Exit codes: 0 completed with all checks passing, 1 invalid/error/interrupted,
2 completed with behavioral assertion failures. Reports are saved for partial runs.
`;
export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (!command || ["help", "--help", "-h"].includes(command)) { console.info(help); return 0; }
  if (command === "compare") {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { out: { type: "string" } } });
    if (positionals.length !== 2) throw new Error("compare requires two result directories");
    const report = compareResults(readResults(positionals[0]), readResults(positionals[1]));
    if (values.out) writeFileSync(resolve(values.out), report, { flag: "wx", mode: 0o600 }); else console.info(report);
    return 0;
  }
  if (!["validate", "run"].includes(command)) throw new Error(`Unknown command ${command}`);
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    fake: { type: "boolean" }, live: { type: "boolean" }, model: { type: "string" }, engine: { type: "string", default: "native" },
    "base-url": { type: "string" }, "api-key-env": { type: "string", default: "OPENAI_COMPAT_API_KEY" }, "auth-home": { type: "string" },
    scenario: { type: "string" }, repetitions: { type: "string" }, out: { type: "string" },
  } });
  if (positionals.length !== 1) throw new Error(`${command} requires one experiment YAML path`);
  const loaded = loadExperiment(positionals[0], values.scenario);
  if (values.repetitions) {
    const n = Number(values.repetitions);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error("repetitions must be 1–20");
    loaded.experiment.repetitions = n;
    loaded.inputHash = hash({ experiment: loaded.experiment, scenarios: loaded.scenarios });
  }
  console.info(JSON.stringify({ name: loaded.experiment.name, scenarios: loaded.scenarios.map(s => s.id), configurations: loaded.configurations.map(c => c.name), repetitions: loaded.experiment.repetitions, trials: trialOrder(loaded).length, limits: loaded.experiment.limits }, null, 2));
  if (command === "validate") return 0;
  if (!!values.fake === !!values.live) throw new Error("Choose exactly one of --fake or --live");
  if (values.engine !== "native" && values.engine !== "openai-compatible") throw new Error("engine must be native or openai-compatible");
  if (values.live && !values.model) throw new Error("Live runs require an explicit --model");
  const provider: ProviderOptions = { live: !!values.live, engine: values.engine, model: values.model ?? "benchmark-fixture" };
  if (provider.live && provider.engine === "native") {
    if (values["base-url"]) throw new Error("--base-url requires --engine openai-compatible");
    const auth = JSON.parse(readFileSync(join(values["auth-home"] ?? join(homedir(), ".codex"), "auth.json"), "utf8"));
    const token = auth.tokens?.access_token;
    if (typeof token !== "string") throw new Error("Selected auth home has no existing access token");
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (Number(claims.exp) * 1000 < Date.now() + (loaded.experiment.limits.maxRunSeconds + 120) * 1000 || !Number.isFinite(claims.exp)) throw new Error("Existing access token must remain valid for the configured run limit; refresh through your normal login or shorten maxRunSeconds");
    provider.credential = token;
    provider.accountId = claims["https://api.openai.com/auth"]?.chatgpt_account_id;
  } else if (provider.live) {
    if (!values["base-url"]) throw new Error("OpenAI-compatible live runs require --base-url");
    const url = new URL(values["base-url"]);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error("Use HTTPS or a loopback HTTP endpoint without credentials, query or fragment");
    provider.endpoint = url.href.replace(/\/+$/, "");
    provider.credential = process.env[values["api-key-env"]!];
    if (!provider.credential) throw new Error(`Set ${values["api-key-env"]} to the provider key (use a placeholder for keyless local endpoints)`);
  }
  const output = resolve(values.out ?? join("artifacts/chat-bench", `${new Date().toISOString().replace(/[:.]/g, "-")}-${loaded.experiment.name}`));
  const controller = new AbortController();
  const stop = () => controller.abort(new Error("Benchmark interrupted"));
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const result = await runExperiment(loaded, { ...provider, output, signal: controller.signal });
    if (result.state !== "completed" || result.trials.some(t => t.status === "error" || t.status === "cancelled")) return 1;
    return result.trials.some(t => t.status === "failed") ? 2 : 0;
  } finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}

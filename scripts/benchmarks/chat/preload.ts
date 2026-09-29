// Imported with --import only in an owned disposable benchmark server.
import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { BenchmarkHooks } from "../../../server/benchmark-hooks.ts";
import type { ResolvedConfiguration } from "./schema.ts";
import { redactSecretsInText } from "../../../shared/redact.ts";

const dir = process.env.OMB_CHAT_BENCH_DIR;
if (!dir || realpathSync(dir) !== realpathSync(process.env.OMB_DATA_DIR ?? ".")) throw new Error("Benchmark preload requires its owned fixture directory");
const spec = JSON.parse(readFileSync(join(dir, "benchmark.json"), "utf8")) as { configuration: ResolvedConfiguration; proxyUrl: string };
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(spec.proxyUrl)) throw new Error("Benchmark provider must be owned loopback proxy");
const cfg = spec.configuration;
const hooks: BenchmarkHooks = {
  prompt(parts) {
    const result = parts.map(p => ({ ...p, text: p.id in cfg.promptSections ? cfg.promptSections[p.id] ?? "" : p.text }))
      .filter(p => !(cfg.memory.mode === "off" && ["memory", "recall", "recent"].includes(p.id)))
      .filter(p => cfg.memory.recall || p.id !== "recall")
      .filter(p => cfg.memory.recentWork || p.id !== "recent");
    appendFileSync(join(dir!, "benchmark-prompts.jsonl"), JSON.stringify({ at: Date.now(), sections: result.map(p => ({ ...p, text: redactSecretsInText(p.text) })) }) + "\n", { mode: 0o600 });
    return result;
  },
  tool(server, name, description) {
    // Regardless of experiment selectors, only fixture tools and these two
    // real memory operations can execute. No arbitrary host/app operations.
    if (server !== "fixture" && !(server === "agents" && ["memory_update", "session_search"].includes(name))) return null;
    if (server === "agents" && (cfg.memory.mode === "off" || (name === "session_search" && !cfg.memory.recall))) return null;
    const full = `${server}_${name}`;
    if (!cfg.tools.allow.some(s => s === full || (s === "fixture_*" && server === "fixture"))) return null;
    return cfg.tools.descriptions[full] ?? description;
  },
};
(globalThis as unknown as Record<symbol, BenchmarkHooks>)[Symbol.for("openmausbot.local-benchmark-hooks")] = hooks;

// Native ChatGPT transport still performs its real protocol conversion. Only
// the provider boundary is redirected; auth headers never enter evidence.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input);
  if (url.startsWith("https://chatgpt.com/backend-api/codex/")) {
    const path = new URL(url).pathname.endsWith("/responses") ? "/responses" : "/models";
    return originalFetch(spec.proxyUrl + path, { ...init, headers: { "content-type": "application/json" } });
  }
  return originalFetch(input, init);
};

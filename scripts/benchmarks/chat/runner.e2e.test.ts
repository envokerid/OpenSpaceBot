import { expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadExperiment } from "./schema.ts";
import { runExperiment } from "./runner.ts";

it("saves an interrupted result and cleans its owned server when cancelled during a turn", async () => {
  const output = mkdtempSync(join(tmpdir(), "chat-bench-cancel-"));
  const controller = new AbortController();
  const loaded = loadExperiment("benchmarks/chat/experiments/smoke.yaml");
  // The first trial crosses the real provider boundary before cancellation.
  loaded.experiment.seed = 0;
  let observedProvider = false;
  const timer = setInterval(() => {
    const provider = join(output, "runs", "0001-lookup-proof-no-tools-1", "provider.jsonl");
    const alternate = join(output, "runs", "0001-lookup-proof-baseline-1", "provider.jsonl");
    if (existsSync(provider) || existsSync(alternate)) { observedProvider = true; controller.abort(); }
  }, 10);
  const fallback = setTimeout(() => controller.abort(), 30_000);
  try {
    const result = await runExperiment(loaded, { live: false, engine: "native", model: "benchmark-fixture", output, signal: controller.signal });
    expect(observedProvider).toBe(true);
    expect(result.state).toBe("interrupted");
    expect(result.trials).toHaveLength(1);
    expect(existsSync(join(output, "report.md"))).toBe(true);
    const trace = JSON.parse(readFileSync(join(output, "runs", result.trials[0].id, "trace.json"), "utf8"));
    expect(trace.fixtureRemoved).toBe(true);
    expect(existsSync(trace.fixture.dataDir)).toBe(false);
    expect(() => process.kill(trace.fixture.serverPid, 0)).toThrow();
  } finally { clearInterval(timer); clearTimeout(fallback); rmSync(output, { recursive: true, force: true }); }
}, 45_000);

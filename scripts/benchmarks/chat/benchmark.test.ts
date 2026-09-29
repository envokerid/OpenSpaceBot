import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { loadExperiment, trialOrder } from "./schema.ts";
import { evaluate } from "./evaluate.ts";
import { compareResults, renderReport, type Results, type TrialResult } from "./report.ts";
import { startProvider } from "./provider.ts";
import { buildSystemPrompt } from "../../../server/system-prompt.ts";
import type { BenchmarkHooks } from "../../../server/benchmark-hooks.ts";
import { mountChatTools } from "../../../server/drivers/chat-mcp-tools.ts";

const dirs: string[] = [];
const temporary = () => { const dir = mkdtempSync(join(tmpdir(), "chat-bench-test-")); dirs.push(dir); return dir; };
const slot = Symbol.for("openmausbot.local-benchmark-hooks");
const globals = globalThis as unknown as Record<symbol, BenchmarkHooks>;
afterEach(() => { delete globals[slot]; for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("benchmark experiment definitions", () => {
  it("loads all starter experiments and interleaves every complete pair reproducibly", () => {
    for (const name of ["smoke", "prompts", "tools", "memory"]) {
      const loaded = loadExperiment(`benchmarks/chat/experiments/${name}.yaml`);
      const order = trialOrder(loaded);
      expect(order).toEqual(trialOrder(loaded));
      expect(order).toHaveLength(loaded.scenarios.length * loaded.configurations.length * loaded.experiment.repetitions);
      for (const scenario of loaded.scenarios) for (const config of loaded.configurations) {
        expect(order.filter(t => t.scenario.id === scenario.id && t.configuration.name === config.name)).toHaveLength(loaded.experiment.repetitions);
      }
    }
  });
  it("rejects dangerous tool selectors, unknown fields, duplicate names and empty filters", () => {
    const dir = temporary();
    const base = { version: 1, name: "test", suite: resolve("benchmarks/chat/suites/smoke.yaml"), baseline: { name: "baseline" }, variants: [{ name: "variant" }] };
    const path = join(dir, "test.yaml");
    for (const variant of [{ name: "variant", tools: { allow: ["agents_*"] } }, { name: "baseline" }, { name: "variant", typo: true }, { name: "variant", promptSections: { misspelled: "ignored" } }, { name: "variant", tools: { allow: ["fixture_*"], fixtures: { lookup: { inputSchema: { type: "object", properties: { id: { type: "invalid" } } } } } } }]) {
      writeFileSync(path, JSON.stringify({ ...base, variants: [variant] }));
      expect(() => loadExperiment(path)).toThrow();
    }
    writeFileSync(path, JSON.stringify(base));
    expect(() => loadExperiment(path, "unknown")).toThrow("No scenarios");
  });
});

describe("scoring", () => {
  it("checks exact arguments and state, not just a claimed answer", () => {
    const evidence = { reply: "Saved", calls: [{ name: "fixture_lookup", args: { id: "WRONG" } }], availableTools: ["fixture_lookup"], prompt: "Fact: OLD", memory: "" };
    const verdicts = evaluate([
      { type: "replyEquals", value: "Saved" },
      { type: "toolCalled", value: "fixture_lookup", args: { id: "A17" } },
      { type: "memoryContains", value: "saved fact" },
      { type: "toolUnavailable", value: "agents_memory_update" },
      { type: "promptNotContains", value: "OLD" },
    ], evidence);
    expect(verdicts.map(v => v.passed)).toEqual([true, false, false, true, false]);
    expect(evaluate([{ type: "replyJson" }], { ...evidence, reply: '```json\n{}\n```' })[0].passed).toBe(false);
  });
});

const trial = (configuration: string, status: TrialResult["status"]): TrialResult => ({
  id: configuration, scenario: "example", scenarioHash: "same", category: "tools", configuration, repetition: 1, status,
  durationMs: 10, firstTextMs: null, inputTokens: null, outputTokens: null, toolCalls: 0, assertions: [],
});
const results = (): Results => ({ version: 1, name: "example", mode: "fake", engine: "native", model: "fixture", inputHash: "input", baseline: "baseline", planned: 3, state: "completed", trials: [trial("baseline", "passed"), trial("variant", "failed"), trial("broken", "error")] });
describe("comparison reporting", () => {
  it("retains failures and unknown usage, excludes infrastructure errors from pairs, labels fake results", () => {
    const report = renderReport(results());
    expect(report).toContain("FAKE ENGINE");
    expect(report).toContain("| variant | 1 | 0 | 1 | 0 |");
    expect(report).toContain("| broken | 0 | 0 | 0 | 0 |");
    expect(report).toContain("unknown / unknown");
    expect(report).toContain("runs/variant/trace.json");
  });
  it("refuses incompatible saved comparisons and does not pair changed scenarios", () => {
    expect(() => compareResults(results(), { ...results(), mode: "live" })).toThrow("different modes");
    const right = results(); right.trials[0].scenarioHash = "changed";
    expect(compareResults(results(), right)).toContain("unmatched");
  });
});

describe("fixture hooks", () => {
  it("keeps normal assembly unchanged and recomputes stable/volatile output for experiments", () => {
    expect(buildSystemPrompt("Persona", "", [{ id: "memory", label: "Memory", text: "secret fact" }]).volatile).toBe("secret fact");
    globals[slot] = { prompt: parts => parts.filter(p => p.id !== "memory"), tool: () => null };
    const built = buildSystemPrompt("Persona", "", [{ id: "memory", label: "Memory", text: "secret fact" }]);
    expect(built.text).toBe("Persona"); expect(built.volatile).toBe("");
  });
  it("rejects execution of filtered tools, even when the caller guesses their names", async () => {
    const path = join(temporary(), "tools.json");
    writeFileSync(path, JSON.stringify([{ name: "lookup", description: "lookup", inputSchema: { type: "object", properties: {} }, responses: [{ text: "found" }] }]));
    globals[slot] = { prompt: p => p, tool: () => null };
    const tools = await mountChatTools({ custom: { fixture: { command: process.execPath, args: [resolve("scripts/benchmarks/chat/tool-fixture.mjs")], env: { CHAT_BENCH_TOOLS: path } } } }, new AbortController().signal);
    try {
      expect(tools.definitions).toEqual([]);
      await expect(tools.execute("fixture_lookup", {}, new AbortController().signal)).rejects.toThrow("not advertised");
    } finally { await tools.close(); }
  });
});

describe("controlled provider", () => {
  it("relays live-mode requests to an owned stub and redacts credentials from response evidence", async () => {
    const credential = "synthetic-benchmark-credential";
    let authorization: string | undefined;
    let status = 200;
    const stub = createServer((req, res) => {
      authorization = req.headers.authorization;
      req.resume();
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: credential }, finish_reason: "stop" }] }));
    });
    await new Promise<void>(resolve => stub.listen(0, "127.0.0.1", resolve));
    const address = stub.address();
    if (!address || typeof address === "string") throw new Error("stub not bound");
    const file = join(temporary(), "provider.jsonl");
    const provider = await startProvider({ live: true, engine: "openai-compatible", model: "fixture", endpoint: `http://127.0.0.1:${address.port}/v1`, credential }, file, 2, new AbortController().signal);
    try {
      const response = await fetch(provider.url + "/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "fixture", messages: [] }) });
      expect(response.status).toBe(200); await response.text();
      expect(authorization).toBe(`Bearer ${credential}`);
      const evidence = readFileSync(file, "utf8");
      expect(evidence).not.toContain(credential);
      expect(evidence).toContain("[credential redacted]");
      status = 429;
      const limited = await fetch(provider.url + "/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "fixture", messages: [] }) });
      expect(limited.status).toBe(429); await limited.text();
      expect(provider.failure).toBe("Provider returned HTTP 429");
    } finally {
      await provider.close();
      stub.closeAllConnections();
      await new Promise<void>(resolve => stub.close(() => resolve()));
    }
  });
  it("only scripts available calls, records requests, and enforces request limits", async () => {
    const file = join(temporary(), "provider.jsonl");
    const provider = await startProvider({ live: false, engine: "openai-compatible", model: "fixture" }, file, 1, new AbortController().signal);
    try {
      provider.setTurn(0, { text: "Done", calls: [{ name: "fixture_hidden", args: {} }] });
      const send = () => fetch(provider.url + "/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "fixture", messages: [{ role: "system", content: "Instructions" }], tools: [] }) });
      const first = await (await send()).json() as any;
      expect(first.choices[0].message.content).toBe("Done");
      expect(first.choices[0].message.tool_calls).toBeUndefined();
      expect((await send()).status).toBe(502);
      expect(provider.failure).toContain("limit");
      expect(readFileSync(file, "utf8")).toContain('"phase":"request"');
    } finally { await provider.close(); }
  });
});

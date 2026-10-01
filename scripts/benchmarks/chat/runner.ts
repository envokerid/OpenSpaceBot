import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchVerificationServer, runControlOmb } from "../../control-omb.ts";
import { verificationServerEnvironment, type VerificationServer } from "../../control-omb.ts";
import { waitForExit } from "../../../server/testing/cleanup.ts";
import { redactSecretsInText } from "../../../shared/redact.ts";
import { evaluate } from "./evaluate.ts";
import { hash, trialOrder, type LoadedExperiment } from "./schema.ts";
import { startProvider, type ProviderOptions } from "./provider.ts";
import { saveResults, type Results, type TrialResult } from "./report.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const jsonLines = (file: string): any[] => existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const readText = (file: string) => existsSync(file) ? readFileSync(file, "utf8") : "";
function snapshot(dir: string): Record<string, string> {
  const result: Record<string, string> = { "MEMORY.md": readText(join(dir, "MEMORY.md")) };
  if (existsSync(join(dir, "memory"))) for (const name of readdirSync(join(dir, "memory"))) {
    if (name.endsWith(".md")) result[`memory/${name}`] = readText(join(dir, "memory", name));
  }
  return result;
}
function revision() {
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 20_000_000 });
    const untracked = git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
    return { commit: git("rev-parse", "HEAD").trim(), dirtyHash: hash({ diff: git("diff", "HEAD", "--"), untracked: untracked.map(p => [p, createHash("sha256").update(readFileSync(join(root, p))).digest("hex")]) }) };
  } catch { return { commit: "unknown", dirtyHash: "unknown" }; }
}

export async function runExperiment(loaded: LoadedExperiment, options: ProviderOptions & { output: string; signal: AbortSignal }) {
  const order = trialOrder(loaded);
  mkdirSync(options.output, { recursive: true, mode: 0o700 });
  if (existsSync(join(options.output, "manifest.json"))) throw new Error("Output already contains a benchmark; choose a new directory");
  const clean = (text: string) => redactSecretsInText(options.credential ? text.replaceAll(options.credential, "[credential redacted]") : text);
  const write = (path: string, value: unknown) => writeFileSync(path, clean(JSON.stringify(value, null, 2)), { mode: 0o600 });
  write(join(options.output, "manifest.json"), {
    version: 1, evaluatorVersion: 1, createdAt: new Date().toISOString(), ...revision(), node: process.version,
    engineVersion: "repository-native-runtime", provider: { engine: options.engine, model: options.model, mode: options.live ? "live" : "fake", endpoint: options.endpoint ?? "ChatGPT native" },
    inputs: loaded, trialOrder: order.map(t => ({ scenario: t.scenario.id, configuration: t.configuration.name, repetition: t.repetition })),
    limitations: ["No semantic judge", "Cost and cache tokens unknown", "Only fixture tools, memory_update and optional session_search", "No provider cache reset", "No exact billing cap; requests and time are bounded"],
  });
  const result: Results = { version: 1, name: loaded.experiment.name, mode: options.live ? "live" : "fake", engine: options.engine, model: options.model,
    inputHash: loaded.inputHash, baseline: loaded.experiment.baseline.name, planned: order.length, state: "running", trials: [] };
  const deadline = AbortSignal.timeout(loaded.experiment.limits.maxRunSeconds * 1000);
  const signal = AbortSignal.any([options.signal, deadline]);
  saveResults(options.output, result);
  try {
    for (const [index, trial] of order.entries()) {
      if (signal.aborted) break;
      const id = `${String(index + 1).padStart(4, "0")}-${trial.scenario.id}-${trial.configuration.name}-${trial.repetition}`;
      const directory = join(options.output, "runs", id); mkdirSync(directory, { recursive: true, mode: 0o700 });
      console.info(`[${index + 1}/${order.length}] ${trial.scenario.id} / ${trial.configuration.name} / repeat ${trial.repetition}`);
      const record: TrialResult = { id, scenario: trial.scenario.id, scenarioHash: hash(trial.scenario), category: trial.scenario.category, configuration: trial.configuration.name,
        repetition: trial.repetition, status: "error", durationMs: 0, firstTextMs: null, inputTokens: null, outputTokens: null, toolCalls: 0, assertions: [] };
      const started = Date.now();
      let fixture: VerificationServer | undefined;
      let child: ChildProcess | undefined;
      let provider: Awaited<ReturnType<typeof startProvider>> | undefined;
      const trace: any = { configuration: trial.configuration, scenario: trial.scenario, commands: [], turns: [] };
      const terminate = () => { child?.kill("SIGTERM"); };
      signal.addEventListener("abort", terminate, { once: true });
      let memoryDir: string | undefined;
      try {
        fixture = await launchVerificationServer({}, signal);
        const { dataDir, url, logPath } = fixture.info;
        trace.fixture = { ...fixture.info };
        provider = await startProvider(options, join(directory, "provider.jsonl"), loaded.experiment.limits.maxRequestsPerTrial, signal);
        await waitForExit(fixture.child, { signal: "SIGTERM" });
        signal.throwIfAborted();
        write(join(dataDir, "benchmark.json"), { configuration: trial.configuration, proxyUrl: provider.url });
        write(join(dataDir, "tools.json"), trial.scenario.tools.map(tool => ({ ...tool, ...trial.configuration.tools.fixtures[tool.name] })));
        const instance = options.engine === "native"
          ? { driver: "nativeAgent", config: { models: { "openai-codex": [options.model] } } }
          : { driver: "openai-compat", config: { url: `${provider.url}/v1`, key: "benchmark-dummy-key", model: options.model } };
        write(join(dataDir, "config.json"), { instances: { benchmark: instance }, mcpServers: {
          fixture: { command: process.execPath, args: [join(root, "scripts/benchmarks/chat/tool-fixture.mjs")], env: { CHAT_BENCH_TOOLS: join(dataDir, "tools.json") }, enabled: true },
        } });
        if (options.engine === "native") {
          const accounts = join(dataDir, "provider-accounts"); mkdirSync(accounts, { recursive: true, mode: 0o700 });
          // The real credential stays in the parent proxy. This valid synthetic
          // account only enables the child's native protocol adapter.
          write(join(accounts, `${createHash("sha256").update("benchmark").digest("hex")}.json`), { version: 1, accounts: { "openai-codex": { accessToken: "benchmark-local-account", expiresAt: Date.now() + 86_400_000 } } });
        }
        const fd = openSync(logPath, "a", 0o600);
        try {
          child = spawn(process.execPath, ["--experimental-strip-types", "--import", join(root, "scripts/benchmarks/chat/preload.ts"), join(root, "server/index.ts")], {
            cwd: root, env: { ...verificationServerEnvironment({}, dataDir, Number(new URL(url).port)), OMB_CHAT_BENCH_DIR: dataDir }, stdio: ["ignore", fd, fd],
          });
        } finally { closeSync(fd); }
        trace.fixture.serverPid = child.pid;
        let spawnError: Error | undefined;
        child.on("error", error => { spawnError = error; });
        const readyUntil = Date.now() + 30_000;
        for (;;) {
          signal.throwIfAborted();
          if (spawnError) throw spawnError;
          if (child.exitCode !== null || child.signalCode !== null) throw new Error("Benchmark server exited during startup; see server.log");
          try { if ((await fetch(`${url}/api/health`, { signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]) })).ok) break; } catch { /* Wait until this child is ready. */ }
          if (Date.now() >= readyUntil) throw new Error("Benchmark server startup timed out");
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        let currentSignal = signal;
        const api = async (method: string, path: string, body?: unknown) => {
          const response = await fetch(url + path, { method, headers: { "content-type": "application/json", origin: url },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.any([currentSignal, AbortSignal.timeout(15_000)]) });
          const value = await response.json() as any;
          if (!response.ok) throw new Error(`${method} ${path}: ${response.status}: ${JSON.stringify(value)}`);
          trace.commands.push({ method, path, body, result: value }); return value;
        };
        const control = async (...args: string[]): Promise<any> => {
          currentSignal.throwIfAborted();
          const value = await runControlOmb([...args, "--url", url]);
          trace.commands.push({ args, result: value }); return value;
        };
        const doctor = await control("doctor");
        if (!doctor.ok) throw new Error("Fixture engine is unavailable");
        const { bot } = await control("new-bot", "--name", "Benchmark");
        let taskId = bot.activeTaskId;
        const model = options.engine === "native" ? `openai-codex:${options.model}` : options.model;
        await control("set-model", "--bot", bot.id, "--instance", "benchmark", "--model", model);
        await api("PATCH", `/api/bots/${bot.id}`, { description: "A benchmark assistant", soul: trial.configuration.instructions ?? trial.scenario.instructions, computer: "off", browser: false, connectors: false, mcpServers: ["fixture"] });
        memoryDir = join(dataDir, "workspaces", bot.id);
        const initialMemory = trial.configuration.memory.mode === "seeded" ? trial.configuration.memory.text ?? trial.scenario.memory : "";
        await api("PUT", `/api/bots/${bot.id}/memory/file`, { path: "MEMORY.md", text: initialMemory });
        if (trial.configuration.memory.mode === "seeded") for (const [name, text] of Object.entries({ ...trial.scenario.topics, ...trial.configuration.memory.topics })) {
          await api("PUT", `/api/bots/${bot.id}/memory/file`, { path: `memory/${name}`, text });
        }
        trace.initialMemory = snapshot(memoryDir);
        let measuredDuration = 0, totalInput = 0, totalOutput = 0, usageComplete = true;
        let executionFailed = false;
        for (const [turnIndex, turn] of trial.scenario.turns.entries()) {
          currentSignal = AbortSignal.any([signal, AbortSignal.timeout(loaded.experiment.limits.turnTimeoutSeconds * 1000)]);
          if (turn.newSession) {
            const fresh = await api("POST", `/api/bots/${bot.id}/tasks`, { title: `Benchmark turn ${turnIndex + 1}` });
            taskId = fresh.task.threadId;
            await control("set-model", "--bot", bot.id, "--task", taskId, "--instance", "benchmark", "--model", model);
          }
          if (turn.instructions !== undefined) await api("PATCH", `/api/bots/${bot.id}`, { soul: turn.instructions });
          provider.setTurn(turnIndex, turn.fake);
          const submittedAt = Date.now();
          const sent = await control("send", "--bot", bot.id, "--task", taskId, "--text", turn.text);
          if (!sent.success) throw new Error(`Send failed: ${JSON.stringify(sent)}`);
          let settled: any;
          for (;;) {
            currentSignal.throwIfAborted();
            if (provider.failure) throw new Error(provider.failure);
            settled = await control("wait", "--bot", bot.id, "--task", taskId, "--timeout", "1");
            if (provider.failure) throw new Error(provider.failure);
            if (settled.status === "settled" || settled.status === "failed") break;
            if (settled.status === "needs-user") {
              const state = await api("GET", "/api/bots");
              const current = state.bots.find((b: any) => b.id === bot.id);
              const cards = (current?.messages ?? []).filter((m: any) => m.card?.requestId && !m.card.answered && m.card.mcpTool === true && /^(fixture_|agents_memory_update$|agents_session_search$)/.test(m.card.tool ?? ""));
              if (!cards.length) throw new Error("Scenario needs an unsupported user interaction");
              for (const { card } of cards) await api("POST", `/api/bots/${bot.id}/respond`, { threadId: taskId, requestId: card.requestId, behavior: "allow" });
            } else if (!["timeout", "running", "busy"].includes(settled.status)) throw new Error(`Conversation did not settle: ${settled.status}`);
          }
          const messages = await control("messages", "--bot", bot.id, "--task", taskId, "--limit", "100");
          const events = jsonLines(join(dataDir, "events", `${taskId}.ndjson`));
          const start = events.findLast(e => e.type === "turn.started");
          if (!start) throw new Error("Missing turn.started evidence");
          const turnEvents = events.filter(e => e.turnId === start.turnId);
          const end = turnEvents.find(e => e.type === "turn.completed");
          if (!end) throw new Error("Missing turn.completed evidence");
          executionFailed ||= !end.ok;
          const first = turnEvents.find(e => e.type === "content.delta" && e.streamKind === "assistant_text") ?? turnEvents.find(e => e.type === "item.completed" && e.itemType === "assistant_text");
          if (turnIndex === 0 && first) record.firstTextMs = Date.parse(first.createdAt) - submittedAt;
          measuredDuration += Date.parse(end.createdAt) - submittedAt;
          const usage = end.usage ?? turnEvents.findLast(e => e.type === "thread.token-usage.updated");
          if (typeof usage?.input === "number" && typeof usage?.output === "number") { totalInput += usage.input; totalOutput += usage.output; } else usageComplete = false;
          const calls = turnEvents.filter(e => e.type === "item.started" && e.itemType === "tool").map(e => {
            let args = {}; try { args = typeof e.input === "string" ? JSON.parse(e.input) : e.input ?? {}; } catch { /* preview may be truncated; trace records it */ }
            return { name: e.title, args };
          });
          const reply = turnEvents.filter(e => e.type === "item.completed" && e.itemType === "assistant_text").map(e => e.text).join("\n");
          const request = provider.requests.find(r => r.turn === turnIndex && (r.body.instructions || r.body.messages?.some((m: any) => m.role === "system")));
          if (!request) throw new Error("Missing provider request evidence");
          const prompt = request.body.instructions ?? request.body.messages.find((m: any) => m.role === "system").content;
          const availableTools = (request.body.tools ?? []).map((t: any) => t.function?.name ?? t.name);
          const finalMemory = snapshot(memoryDir);
          const evidence = { reply, calls, prompt, availableTools, memory: finalMemory["MEMORY.md"] };
          const assertions = evaluate(turn.assertions, evidence);
          record.assertions.push(...assertions); record.toolCalls += calls.length;
          trace.turns.push({ turnIndex, taskId, submittedAt, settled, messages, events: turnEvents, evidence, memory: finalMemory, assertions });
          write(join(directory, "trace.json"), trace);
          if (!end.ok) break;
        }
        record.durationMs = measuredDuration;
        record.inputTokens = usageComplete ? totalInput : null; record.outputTokens = usageComplete ? totalOutput : null;
        record.status = !executionFailed && record.assertions.every(a => a.passed) ? "passed" : "failed";
        if (executionFailed) record.error = "Model turn failed; see runtime events";
      } catch (error) {
        record.status = signal.aborted ? "cancelled" : "error";
        record.error = clean(error instanceof Error ? error.message : String(error));
        record.durationMs = Date.now() - started;
      } finally {
        signal.removeEventListener("abort", terminate);
        try {
          await waitForExit(child, { signal: "SIGTERM" });
          if (provider) await provider.close();
          if (fixture) {
            if (memoryDir) trace.finalMemory = snapshot(memoryDir);
            const prompts = join(fixture.info.dataDir, "benchmark-prompts.jsonl");
            if (existsSync(prompts)) copyFileSync(prompts, join(directory, "prompts.jsonl"));
            writeFileSync(join(directory, "server.log"), clean(readText(fixture.info.logPath)), { mode: 0o600 });
            const eventDirectory = join(fixture.info.dataDir, "events");
            if (existsSync(eventDirectory)) {
              mkdirSync(join(directory, "events"), { mode: 0o700 });
              for (const file of readdirSync(eventDirectory).filter(f => f.endsWith(".ndjson"))) writeFileSync(join(directory, "events", file), clean(readText(join(eventDirectory, file))), { mode: 0o600 });
            }
            const journalDirectory = join(fixture.info.dataDir, "memory-journal");
            if (existsSync(journalDirectory)) trace.memoryJournal = readdirSync(journalDirectory).filter(f => f.endsWith(".ndjson")).flatMap(f => jsonLines(join(journalDirectory, f)));
          }
        } catch (error) { record.status = "error"; record.error = `Cleanup/evidence failed: ${clean(String(error))}`; }
        finally {
          const cleanup = await Promise.allSettled([provider?.close(), fixture?.close()]);
          for (const item of cleanup) if (item.status === "rejected") { record.status = "error"; record.error = `Fixture cleanup failed: ${clean(String(item.reason))}`; }
        }
        if (fixture) trace.fixtureRemoved = !existsSync(fixture.info.dataDir);
        trace.result = record;
        write(join(directory, "trace.json"), trace);
        result.trials.push(record); saveResults(options.output, result);
      }
      console.info(`  ${record.status}${record.error ? `: ${record.error}` : ""}`);
    }
  } finally {
    result.state = result.trials.length === result.planned && !signal.aborted ? "completed" : "interrupted";
    saveResults(options.output, result);
  }
  console.info(`Report: ${join(options.output, "report.md")}`);
  return result;
}

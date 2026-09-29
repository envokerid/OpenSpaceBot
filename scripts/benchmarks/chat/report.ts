import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Verdict } from "./evaluate.ts";

export interface TrialResult {
  id: string; scenario: string; scenarioHash: string; category: string; configuration: string; repetition: number;
  status: "passed" | "failed" | "error" | "cancelled";
  durationMs: number; firstTextMs: number | null;
  inputTokens: number | null; outputTokens: number | null;
  toolCalls: number; assertions: Verdict[]; error?: string;
}
export interface Results {
  version: 1; name: string; mode: "live" | "fake"; engine: string; model: string;
  inputHash: string; baseline: string; planned: number; state: "running" | "completed" | "interrupted";
  trials: TrialResult[];
}
const cell = (s: string) => s.replaceAll("|", "\\|").replaceAll("\n", " ");
function mean(values: number[]): string { return values.length ? String(Math.round(values.reduce((a, b) => a + b, 0) / values.length)) : "unknown"; }
export function renderReport(result: Results): string {
  const rows = [
    `# ${result.name}`, "",
    result.mode === "fake" ? "**FAKE ENGINE — harness verification only. Scores, timing and synthetic tokens do not measure model quality.**" : `Live benchmark: ${result.engine} / ${result.model}.`,
    "", `State: ${result.state}. Recorded ${result.trials.length} of ${result.planned} planned trials.`,
    "", "| Configuration | Passed / completed | Errors / cancelled | Assertions passed | Mean duration ms | Mean first text ms | Input / output tokens |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const name of new Set(result.trials.map(t => t.configuration))) {
    const trials = result.trials.filter(t => t.configuration === name);
    const completed = trials.filter(t => t.status === "passed" || t.status === "failed");
    const assertions = completed.flatMap(t => t.assertions);
    const sum = (key: "inputTokens" | "outputTokens") => trials.some(t => t[key] === null) ? "unknown" : trials.reduce((n, t) => n + t[key]!, 0);
    rows.push(`| ${cell(name)} | ${completed.filter(t => t.status === "passed").length} / ${completed.length} | ${trials.length - completed.length} | ${assertions.filter(a => a.passed).length} / ${assertions.length} | ${mean(completed.map(t => t.durationMs))} | ${mean(completed.flatMap(t => t.firstTextMs === null ? [] : [t.firstTextMs]))} | ${sum("inputTokens")} / ${sum("outputTokens")} |`);
  }
  rows.push("", "## Paired comparisons", "", "Only completed trials with the same scenario and repetition are paired. Small samples are exploratory.", "", "| Variant | Pairs | Improvements | Regressions | Unchanged |", "| --- | --- | --- | --- | --- |");
  for (const name of [...new Set(result.trials.map(t => t.configuration))].filter(n => n !== result.baseline)) {
    let pairs = 0, improved = 0, regressed = 0;
    for (const t of result.trials.filter(t => t.configuration === name && ["passed", "failed"].includes(t.status))) {
      const b = result.trials.find(b => b.configuration === result.baseline && b.scenarioHash === t.scenarioHash && b.repetition === t.repetition && ["passed", "failed"].includes(b.status));
      if (!b) continue;
      pairs++;
      if (t.status === "passed" && b.status === "failed") improved++;
      if (t.status === "failed" && b.status === "passed") regressed++;
    }
    rows.push(`| ${cell(name)} | ${pairs} | ${improved} | ${regressed} | ${pairs - improved - regressed} |`);
  }
  rows.push("", "## Individual trials", "", "| Scenario | Configuration | Repeat | Result | Failed checks / error | Evidence |", "| --- | --- | --- | --- | --- | --- |");
  for (const t of result.trials) rows.push(`| ${cell(t.scenario)} | ${cell(t.configuration)} | ${t.repetition} | ${t.status} | ${cell(t.error ?? t.assertions.filter(a => !a.passed).map(a => `${a.type}: ${a.value ?? ""}`).join("; "))} | [trace](runs/${t.id}/trace.json) |`);
  rows.push("", "Cost and cached tokens: unknown (not inferred from missing provider data). Token totals cover observed conversation turns, excluding auxiliary model requests; provider.jsonl records those requests too. First text is measured from submission using canonical runtime events. Assertions measure only their stated criteria; no automatic semantic judge is included.", "");
  return rows.join("\n");
}
export function saveResults(directory: string, result: Results) {
  writeFileSync(join(directory, "results.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
  writeFileSync(join(directory, "report.md"), renderReport(result), { mode: 0o600 });
}
export function readResults(directory: string): Results {
  const value = JSON.parse(readFileSync(join(directory, "results.json"), "utf8"));
  if (value.version !== 1 || !Array.isArray(value.trials) || !["fake", "live"].includes(value.mode)) throw new Error("Not a chat benchmark result directory");
  return value;
}
export function compareResults(left: Results, right: Results): string {
  if (left.mode !== right.mode || left.engine !== right.engine || left.model !== right.model) throw new Error("Cannot compare different modes, engines or models");
  const rows = ["# Saved benchmark comparison", "", `Before: ${left.name}. After: ${right.name}.`, "", "Matched by scenario content, configuration name and repetition. Unmatched cases are reported, not counted as improvements.", "", "| Scenario | Configuration | Repeat | Before | After |", "| --- | --- | --- | --- | --- |"];
  for (const t of right.trials) {
    const previous = left.trials.find(b => b.scenarioHash === t.scenarioHash && b.configuration === t.configuration && b.repetition === t.repetition);
    rows.push(`| ${cell(t.scenario)} | ${cell(t.configuration)} | ${t.repetition} | ${previous?.status ?? "unmatched"} | ${t.status} |`);
  }
  const removed = left.trials.filter(b => !right.trials.some(t => t.scenarioHash === b.scenarioHash && t.configuration === b.configuration && t.repetition === b.repetition));
  rows.push("", `${removed.length} earlier trials have no matching later trial.`, "");
  return rows.join("\n");
}

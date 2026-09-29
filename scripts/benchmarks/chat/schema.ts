import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import { z } from "zod";
import { Ajv } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import formats from "ajv-formats";

const id = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const text = z.string().max(100_000);
const topicName = z.string().regex(/^[a-zA-Z0-9 _-]+\.md$/);
const toolName = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/);
const selector = z.string().regex(/^(fixture_[a-z0-9_]+|fixture_\*|agents_memory_update|agents_session_search)$/);
const parameters = z.record(z.string(), z.unknown()).superRefine((schema, ctx) => {
  try {
    if (schema.type !== "object") throw new Error("tool schema must have type object");
    const compiler = schema.$schema === "https://json-schema.org/draft/2020-12/schema" ? new Ajv2020({ strict: false }) : new Ajv({ strict: false });
    formats.default(compiler);
    compiler.compile(schema);
  } catch (error) { ctx.addIssue({ code: "custom", message: `Invalid tool schema: ${String(error)}` }); }
});
const responses = z.array(z.object({ text, isError: z.boolean().default(false) }).strict()).min(1).max(20);
const sectionIds = new Set(["persona", "soul", "setup", "files", "computer", "team-computer", "plan", "composio", "mcp", "browser", "coordination-rules", "coordination", "assignment", "outstanding", "credential", "recall", "routine", "routine-execution", "profile", "learn", "section-context", "recent", "memory", "skills", "skill-instructions", "playbooks", "webhook", "mentions"]);
const memory = z.object({
  mode: z.enum(["seeded", "empty", "off"]).default("seeded"),
  text: text.optional(), topics: z.record(topicName, text).default({}),
  recall: z.boolean().default(false), recentWork: z.boolean().default(false),
}).strict();
const config = z.object({
  name: id,
  instructions: text.optional(),
  promptSections: z.record(id.refine(value => sectionIds.has(value), "Unknown prompt section"), text.nullable()).optional(),
  memory: memory.optional(),
  tools: z.object({
    allow: z.array(selector).max(40), descriptions: z.record(toolName, text).default({}),
    fixtures: z.record(toolName, z.object({ name: toolName.optional(), inputSchema: parameters.optional(), responses: responses.optional() }).strict()).default({}),
  }).strict().optional(),
}).strict();
const assertion = z.object({
  type: z.enum(["replyContains", "replyNotContains", "replyEquals", "replyJson", "toolCalled", "toolNotCalled", "toolAvailable", "toolUnavailable", "memoryContains", "memoryNotContains", "promptContains", "promptNotContains"]),
  value: text.optional(), args: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((a, ctx) => {
  if (a.type !== "replyJson" && !a.value) ctx.addIssue({ code: "custom", message: "assertion value is required" });
  if (a.args && a.type !== "toolCalled") ctx.addIssue({ code: "custom", message: "args is only supported for toolCalled" });
});
export const scenarioSchema = z.object({
  id, category: z.enum(["instructions", "tools", "memory"]), description: text,
  instructions: text.default("Be concise. Use the available tools when needed. Never invent a lookup result."),
  memory: text.default(""), topics: z.record(topicName, text).default({}),
  tools: z.array(z.object({
    name: toolName, description: text,
    inputSchema: parameters,
    responses,
  }).strict()).max(30).default([]),
  turns: z.array(z.object({
    text: text.min(1), newSession: z.boolean().default(false), instructions: text.optional(),
    assertions: z.array(assertion).min(1),
    fake: z.object({ text, calls: z.array(z.object({ name: toolName, args: z.record(z.string(), z.unknown()) }).strict()).max(10).default([]) }).strict(),
  }).strict()).min(1).max(12),
}).strict();
const suiteSchema = z.object({ version: z.literal(1), scenarios: z.array(scenarioSchema).min(1).max(100) }).strict();
const experimentSchema = z.object({
  version: z.literal(1), name: id, suite: z.string().min(1),
  baseline: config, variants: z.array(config).min(1).max(12),
  repetitions: z.number().int().min(1).max(20).default(3), seed: z.number().int().default(42),
  limits: z.object({
    turnTimeoutSeconds: z.number().int().min(5).max(300).default(90),
    maxRequestsPerTrial: z.number().int().min(1).max(100).default(20),
    maxRunSeconds: z.number().int().min(10).max(86400).default(1800),
  }).strict().default({ turnTimeoutSeconds: 90, maxRequestsPerTrial: 20, maxRunSeconds: 1800 }),
}).strict();
export type Scenario = z.infer<typeof scenarioSchema>;
export type Configuration = z.infer<typeof config>;
export type Experiment = z.infer<typeof experimentSchema>;
export type ResolvedConfiguration = ReturnType<typeof resolveConfiguration>;
export type LoadedExperiment = ReturnType<typeof loadExperiment>;
export function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function readYaml(file: string): unknown {
  const source = readFileSync(file, "utf8");
  if (Buffer.byteLength(source) > 2_000_000) throw new Error("Benchmark definition exceeds 2MB");
  const doc = parseDocument(source, { uniqueKeys: true });
  if (doc.errors.length) throw new Error(`${file}: ${doc.errors[0].message}`);
  return doc.toJS({ maxAliasCount: 50 });
}
function unique(names: string[], label: string) {
  if (new Set(names).size !== names.length) throw new Error(`Duplicate ${label}`);
}
export function resolveConfiguration(baseline: Configuration, variant?: Configuration) {
  return {
    name: variant?.name ?? baseline.name,
    instructions: variant?.instructions ?? baseline.instructions,
    promptSections: { ...baseline.promptSections, ...variant?.promptSections },
    memory: variant?.memory ?? baseline.memory ?? memory.parse({}),
    tools: variant?.tools ?? baseline.tools ?? { allow: ["fixture_*", "agents_memory_update"], descriptions: {}, fixtures: {} },
  };
}
export function loadExperiment(file: string, filter?: string) {
  const path = resolve(file);
  const experiment = experimentSchema.parse(readYaml(path));
  const suitePath = resolve(dirname(path), experiment.suite);
  const suite = suiteSchema.parse(readYaml(suitePath));
  unique([experiment.baseline.name, ...experiment.variants.map(v => v.name)], "configuration name");
  unique(suite.scenarios.map(s => s.id), "scenario id");
  for (const s of suite.scenarios) unique(s.tools.map(t => t.name), `tool in ${s.id}`);
  const scenarios = filter ? suite.scenarios.filter(s => s.id === filter || s.category === filter) : suite.scenarios;
  if (!scenarios.length) throw new Error(`No scenarios match ${filter}`);
  const configurations = [resolveConfiguration(experiment.baseline), ...experiment.variants.map(v => resolveConfiguration(experiment.baseline, v))];
  for (const scenario of scenarios) for (const configuration of configurations) {
    unique(scenario.tools.map(tool => configuration.tools.fixtures[tool.name]?.name ?? tool.name), `resolved tool in ${scenario.id}/${configuration.name}`);
  }
  return { path, suitePath, experiment, scenarios, configurations, inputHash: hash({ experiment, scenarios }) };
}
export function trialOrder(loaded: LoadedExperiment) {
  let seed = loaded.experiment.seed >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: loaded.experiment.repetitions }, (_, i) => i + 1).flatMap(repetition =>
    loaded.scenarios.flatMap(scenario => {
      const configs = [...loaded.configurations];
      for (let i = configs.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [configs[i], configs[j]] = [configs[j], configs[i]]; }
      return configs.map(configuration => ({ scenario, configuration, repetition }));
    }));
}

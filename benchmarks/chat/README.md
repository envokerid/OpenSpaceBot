# Chat mechanics benchmark

Compare system instructions, tools, and memory through isolated single-bot
conversations. Save actual prompts/tool catalogs, replies, tool activity, memory
snapshots, runtime events, and a Markdown comparison report.

## Start here

From the repository root, with the existing dependencies installed:

```sh
pnpm bench:chat validate benchmarks/chat/experiments/memory.yaml
pnpm bench:chat run benchmarks/chat/experiments/smoke.yaml --fake
```

If pnpm is not on your PATH, use the equivalent entry point:

```sh
node --experimental-strip-types scripts/bench-chat.ts run benchmarks/chat/experiments/smoke.yaml --fake
```

The smoke run intentionally removes a required lookup tool. Expect the baseline
to pass, `no-tools` to fail, and exit code **2**. Fake replies and tool calls are
scripted: they verify the harness, not model quality or real-model latency/cost.

## Real-model comparisons

The default engine is the app's native runtime with its ChatGPT provider. Choose
a model available to your account:

```sh
pnpm bench:chat run benchmarks/chat/experiments/memory.yaml --live --model YOUR_MODEL --scenario memory --repetitions 3
```

This reads the existing access token from `~/.codex/auth.json`; `--auth-home DIR`
selects another directory containing `auth.json`. It never copies or refreshes
the refresh token, changes your login, or uses live conversations. The access
token must remain valid for `maxRunSeconds` plus two minutes. Refresh through
your normal login if necessary, or choose a shorter run limit.

For an OpenAI-compatible Chat Completions endpoint:

```sh
pnpm bench:chat run benchmarks/chat/experiments/tools.yaml --live \
  --engine openai-compatible --base-url https://YOUR_PROVIDER/v1 \
  --model YOUR_MODEL --api-key-env BENCHMARK_API_KEY --scenario tools
```

Set the named environment variable through your usual credential setup. Loopback
HTTP endpoints are supported; use a placeholder key for keyless local endpoints.
Real credentials stay in the parent provider proxy and are excluded from evidence.
The disposable server uses a synthetic credential.

`--live` makes real provider requests and may incur charges. Limits bound requests
per trial, turn time, and total run time, not an exact monetary or token budget.
Three repetitions give a quick comparison, not statistical proof.

## Experiments

| File | Variants |
| --- | --- |
| `experiments/prompts.yaml` | Scenario instructions, explicit global instructions, removed standing instructions |
| `experiments/tools.yaml` | Normal tools, removed fixture tools, vague lookup description |
| `experiments/memory.yaml` | Seeded notes, memory off, initially empty notes |
| `experiments/smoke.yaml` | One lookup with an intentionally failing tool-removal variant |

The suite has 12 scenarios. `--scenario` accepts a scenario ID or a category:
`instructions`, `tools`, `memory`. `--repetitions N` overrides the repeat count.

Suite paths are relative to the experiment YAML:

```yaml
version: 1
name: my-memory-experiment
suite: ../suites/single-bot.yaml
baseline:
  name: baseline
variants:
  - name: no-memory
    memory:
      mode: off
repetitions: 3
limits:
  turnTimeoutSeconds: 90
  maxRequestsPerTrial: 20
  maxRunSeconds: 1800
```

Configuration controls:

- `instructions`: replace the scenario's initial standing instructions.
- `promptSections`: replace an existing named section, or remove it with `null`.
  Ordering is preserved; overrides apply every turn. Example: `{ soul: null }`.
- `memory.mode`: `seeded` loads scenario notes; `empty` permits writes but starts
  without notes; `off` also suppresses injected notes, recent work, recall, and
  memory tools. `memory.text` overrides initial notes and `memory.topics` maps
  safe topic filenames to content. `recall` and `recentWork` default to false.
  Recall also requires allowing `agents_session_search`.
- `tools.allow`: exact exposed names or `fixture_*`. Only scenario fixture tools,
  `agents_memory_update`, and `agents_session_search` can execute. Other app tools
  are removed from both the catalog and execution registry.
- `tools.descriptions`: overrides by exposed name, e.g. `fixture_lookup`. Tool
  names, input schemas, and response sequences are declared in the scenario.
- `tools.fixtures`: override a fixture's `name`, `inputSchema`, or `responses`,
  keyed by its original short name (e.g. `lookup`). This lets the same scenario
  compare schema, naming, or output changes. Schemas are compiled during validation;
  a renamed tool uses its new `fixture_` name for allowlists and assertions.

Variants inherit the baseline. `promptSections` maps merge; supplying a `memory`
or `tools` block replaces that entire block with the new values and defaults.

## Scenarios and scoring

See `suites/single-bot.yaml`. Each scenario declares initial instructions, notes,
topic files, fixture tools, and ordered user turns. Fixture tools have a JSON
Schema and response sequence, repeating the last response once exhausted. They
cannot run shell commands, access external services, or write arbitrary files.

Each turn has `text`, `assertions`, and a `fake` script for offline testing.
`newSession: true` starts a fresh conversation while retaining the scenario's bot
memory. A turn's `instructions` updates standing instructions before sending.

Assertions: `replyContains`, `replyNotContains`, `replyEquals`, `replyJson`,
`toolCalled`, `toolNotCalled`, `toolAvailable`, `toolUnavailable`, `memoryContains`,
`memoryNotContains`, `promptContains`, `promptNotContains`. All except `replyJson`
take `value`; `toolCalled` optionally matches an `args` subset. Text checks are
case-sensitive. Memory checks inspect `MEMORY.md`; reply checks exclude reasoning.
Expected answers, assertions, and fake scripts never go to the live provider.

Identical success criteria measure lost capability when a tool or memory source
is removed. Add separate fallback scenarios to distinguish honest inability from
fabrication. Literal checks are not a semantic judge; inspect transcripts for
qualitative decisions.

## Results

The runner prints a report path and saves:

```text
artifacts/chat-bench/<timestamp>-<experiment>/
  manifest.json       Frozen inputs, hashes, revision, engine and limits
  results.json        Structured scores and metrics
  report.md           Aggregate results, paired changes, individual trials
  runs/<trial>/
    trace.json        Commands, transcripts, assertions, memory before/after
    prompts.jsonl     Prompt sections, including settings preview calls
    provider.jsonl    Actual provider requests and responses
    events/          Canonical runtime events, including failed turns
    server.log       Isolated server log
```

Provider requests are authoritative for what the model received; preview calls
alone are not. Each trial gets a fresh workspace and engine session. State only
persists within a scenario. A seeded ordering interleaves configurations, but
model output and provider caches are not deterministic.

```sh
pnpm bench:chat compare artifacts/chat-bench/BEFORE artifacts/chat-bench/AFTER
pnpm bench:chat compare artifacts/chat-bench/BEFORE artifacts/chat-bench/AFTER --out comparison.md
```

Saved comparisons require the same mode, engine, and model. Matching uses scenario
content, configuration name, and repetition. Changed/unmatched cases remain
visible. Keep configuration names consistent across revisions when comparing an
implementation change; inspect the frozen configurations in the manifests.

Use `--out DIRECTORY` to select a new run directory. Existing results are never
overwritten. Reports update after each trial. Ctrl-C saves partial evidence and
stops owned processes. Exit codes: **0** all trials pass; **2** behavioral failures;
**1** invalid input, infrastructure errors, or interruption.

Reports retain unknown usage and distinguish infrastructure errors from behavioral
failures. Cost and cached-token totals are currently unknown. First-text timing
uses the first turn; duration sums turn time, excluding fixture setup. Auxiliary
model requests appear in provider evidence but not conversation token totals.

## Scope

This MVP supports the native ChatGPT and OpenAI-compatible runtimes, text chats,
declarative fixture tools, and real memory operations. CLI engines, arbitrary
external services, team coordination, simulated users, automatic semantic
judging, and UI are later extensions.

See [verification](../../docs/verification/chat-benchmark.md). Hooks are installed
by a local preload only in the owned benchmark process. Normal app startup does
not install them. No browser, emulator, or live user-data mutation is needed.

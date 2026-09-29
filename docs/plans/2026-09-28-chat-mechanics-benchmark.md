# Chat mechanics benchmark

Status: initial MVP implemented, 2026-09-28. The design below includes future
extensions; see [the benchmark guide](../../benchmarks/chat/README.md) for the
implemented command, controls, supported engines, and current limitations.

Confirmed: developer command with saved comparison reports, focused initially on
single-bot instructions, tool use, and memory. Text-only scenarios are proposed
for the MVP. Team coordination follows later.

## Purpose

Answer: when we change system instructions, available tools, or memory, which
chat behaviors improve, which regress, and what happens to latency and usage?

Run the same scenarios against a baseline and named variants through the real
OpenMausBot conversation pipeline. Save enough evidence to explain each result.
Changing a prompt should not require editing a benchmark script.

## User workflow

1. Choose a versioned scenario suite and baseline configuration.
2. Define variants, initially changing one factor at a time.
3. Validate the experiment and inspect the planned run count and limits.
4. Run it in disposable workspaces.
5. Read a comparison report and inspect individual conversation traces.
6. Rerun selected failures or compare against an earlier saved baseline.

Proposed command shape, not currently available:

```sh
pnpm bench:chat validate benchmarks/chat/experiments/memory.yaml
pnpm bench:chat run benchmarks/chat/experiments/memory.yaml --live
pnpm bench:chat compare artifacts/chat-bench/<baseline> artifacts/chat-bench/<candidate>
```

Real-model execution is explicit, as in the existing latency scripts. A fake
engine mode validates the harness but never produces a model-quality claim.

## Experiment model

Three separately versioned inputs:

| Input | Contents |
| --- | --- |
| Scenario | Initial fixture, ordered user turns, session boundaries, expected behavior, assertions |
| Configuration | Engine/model/settings, prompt overrides, tool catalog, memory and recall policy |
| Experiment | Suite, baseline, variants, repetitions, ordering seed, resource limits, evaluators |

Freeze inputs in the result manifest. Record repository revision and dirty-tree
fingerprint, engine version, requested and reported model/settings, scenario and
configuration hashes, evaluator version, and run timestamps. Never include
credentials in the manifest.

Hold engine/model/effort and fixture data constant when comparing mechanics.
Model comparisons are separate experiments. Record unsupported settings instead
of silently treating different configurations as equivalent.

### Configuration axes

- **System instructions:** replace, append to, or omit named prompt sections;
  compare wording, length, and explicit behavioral guidance. Preserve section
  order unless ordering is the declared experimental change.
- **Tools:** availability, names, descriptions, schemas, and fixture responses.
  Distinguish changing the exposed definition from changing implementation or
  output. Include missing tools, distractor tools, errors, and large responses.
- **Memory:** initial `MEMORY.md`, topic files, write policy, injected excerpt,
  recall access, and seeded conversation history. Compare empty, relevant,
  irrelevant, stale/conflicting, and over-budget memory.
- **Context lifecycle:** ongoing conversation versus a new session carrying
  durable memory. Resume/restart and compaction can extend the suite later.

"Memory off" needs an explicit definition: suppress injected notes, disable
memory writes, remove topic files, disable recall, and/or omit recent-work
briefs. Turning off one source must not accidentally leave an equivalent source
available. Save the resolved policy in the report.

The runner must apply variants to actual dispatched prompts and mounted tools,
not just settings previews. Catalog filtering must also prevent execution of
excluded tools. Drivers with unobservable or uncontrollable built-in tools must
declare that limitation; unsupported experiments are skipped with a reason.

## Initial scenarios

Start with approximately 12–20 small, readable scenarios, including:

| Area | Example | Evidence of success |
| --- | --- | --- |
| Instructions | Follow a requested output structure across several turns | Structure assertions and content rubric |
| Instruction updates | Apply a changed standing instruction on the next turn | Actual dispatched context and response |
| Tool selection | Answer using a fixture lookup with several distractor tools | Correct lookup arguments and grounded answer |
| Tool restraint | Answer a question that needs no external action | No unnecessary calls |
| Tool recovery | Receive a recoverable tool error | Bounded recovery and correct final result |
| Memory recall | Use a saved preference in a new conversation | Preference applied without repeating it in the user turn |
| Memory correction | User corrects a previously saved fact | Corrected state and use in a later fresh conversation |
| Memory relevance | Unrelated saved notes accompany a simple question | Correct answer without unrelated disclosure |
| Memory limits | Relevant fact sits beyond the loaded excerpt | Retrieval when available; no fabricated recall |
| Persistence | Learn a durable fact, then start a fresh conversation | Fact saved and subsequently used |

Each scenario declares expected behavior under restricted variants: for example,
without a lookup tool an honest inability to look up a fact differs from making
up an answer. Keep task completion and fallback correctness as separate metrics.

Use fixed user turns and explicit session boundaries first. Where branching is
necessary, declare deterministic branches. A model-generated simulated user is
outside the MVP because it adds another changing variable.

## Execution and isolation

Reuse `launchVerificationServer` and `runControlOmb` from
`scripts/control-omb.ts`; follow `docs/verification/README.md`.

Each scenario × configuration × repetition gets independent writable state and
engine sessions. Reset memory, history, search indexes, tool state, and any
recent-work context. Carry state forward only within a scenario when specified.
Run tools against controlled fixture services and temporary files. Disposable
data directories alone do not isolate arbitrary shell or network tools; the MVP
must restrict execution to fixture capabilities and supported engine settings.

Use real memory loading, writes, and search against synthetic data. Stub external
services at their boundary so the application's tool dispatch remains exercised.
Do not read or mutate live conversations or personal memory. Model authentication
uses the existing explicitly selected live-benchmark pattern.

Start with sequential execution, interleaving baseline/variant runs in a seeded
order. Default to three repetitions as a smoke comparison, with more repetitions
for decisions; do not describe small differences from three runs as conclusive.
An ordering seed does not make model sampling deterministic. Record caching and
session lifecycle where observable; fresh sessions do not guarantee cold
provider caches.

Bound turns, calls, tokens where supported, time, and estimated spend. Missing
usage or prices remain unknown rather than zero. Stop new work at limits and
cancel active work where supported; reported usage can lag, so a spend threshold
is not an exact billing ceiling. Save partial results on interruption.

## Evaluation and reports

Use deterministic assertions wherever possible: tool arguments, forbidden calls,
output structure, fixture state, memory diffs, and lifecycle completion. Evaluate
outcomes rather than requiring an incidental exact tool sequence.

Use explicit rubrics for answer correctness, instruction adherence, relevance,
and unsupported claims. Human review can supply these scores initially. Optional
model judging uses a fixed versioned judge/prompt, hides variant names, swaps
pairwise order, and reports its reasoning separately from mechanical assertions.
The tested model never receives expected answers or grading instructions.

Report dimensions separately rather than starting with one aggregate score:

- Task success and assertion pass rate, by scenario and category.
- Instruction adherence and answer-quality rubric scores, when evaluated.
- Tool calls, failed/unnecessary calls, and recovery outcomes.
- Memory reads/writes and whether later conversations use the resulting state.
- Time to first assistant text and total scenario duration.
- Input/output/cache tokens and reported or estimated cost, clearly labeled.
- Errors, timeouts, skips, missing observations, and run-to-run variability.

Show paired baseline/variant changes, sample counts, and per-scenario regressions.
Avoid misleading tail percentiles with tiny samples. Infrastructure errors stay
visible and are distinguished from behavioral failures; report both completion
rate and quality among completed cases. Never silently rerun until a case passes.

Save machine-readable JSON and a Markdown comparison report, plus per-run JSONL
events/transcripts, prompt sections, tool definitions/calls/results, assertions,
and initial/final memory snapshots. Show truncation and missing coverage. Capture
the application dispatch and, where supported, the provider request after driver
transformation; do not claim visibility into hidden engine context. Keep secrets
out of captures. Reports include direct pointers to the evidence for each failure.

## Repository integration

Existing foundations to reuse:

- `server/system-prompt.ts`: named prompt sections and stable/volatile split.
- `server/index.ts`: actual per-turn assembly, dispatch, and settings preview.
  The preview explicitly differs from running-task prompts.
- `server/contracts.ts`: shared turn inputs, session/history controls, integrations.
- `server/workspace.ts`: memory loading, budgets, guidance, and writes.
- `server/memory-journal.ts`: memory change evidence.
- `server/drivers/chat-mcp-tools.ts`: one existing tool transport; coverage for
  other drivers needs their corresponding mounting/dispatch paths.
- `server/usage-ledger.ts`: existing usage accounting.
- `scripts/bench-response-latency.ts` and
  `scripts/bench-native-response-latency.ts`: isolated live-run patterns.

Proposed additions: versioned definitions under `benchmarks/chat/`, a thin
`scripts/bench-chat.ts` entry point, and focused runner/evaluation/report modules
under `scripts/benchmarks/chat/`. Keep experiment policy out of `server/index.ts`;
introduce only the necessary fixture-scoped configuration and observation hooks.
Hooks must be unavailable during ordinary production startup.

Design the experiment format around capabilities, not a single engine. Implement
the first live adapter for the native runtime, subject to verifying its capture
and tool-control coverage, then extend to CLI engines. A passing native suite
does not prove equivalent behavior on other engines.

## Delivery sequence and acceptance

1. **Runner contract:** schema validation, isolated fixture lifecycle, one scenario,
   baseline plus one variant, fake-engine execution, JSON/Markdown reports.
2. **Mechanics coverage:** prompt/tool/memory overrides and evidence capture;
   prove applied changes, state reset, session boundaries, and unsupported cases.
3. **Useful benchmark:** initial scenario suite, real-model adapter, repeated
   paired comparisons, limits, partial reports, and human-review rubrics.
4. **Extensions:** optional model judges, broader engine coverage, interaction
   experiments, team coordination, CI regression policy, and eventually app UI.

MVP acceptance: one command compares a baseline with prompt, tool, and memory
variants on the initial suite; every result is traceable to frozen inputs and
observed outputs; separate repetitions cannot leak state; interrupted runs retain
usable evidence; fake-engine results cannot masquerade as quality measurements.

Test schema validation, scoring against known traces, report aggregation with
missing/error data, configuration application, and isolation. Follow the shared
verification recipe for server integration, including an intentionally failing
case to prove regression detection. Live trials validate the evaluation workflow,
not a universal claim about model quality. No UI work is needed for this phase.

## Remaining product decisions

- Choose the first engine/model and practical live-run budget at implementation time.
- Select real examples of current undesirable behavior to turn into scenario seeds.
- Decide whether automatic model judging is necessary for the first useful release.

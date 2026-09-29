# Chat mechanics benchmark

The benchmark launches isolated servers using `launchVerificationServer` from
`scripts/control-omb.ts`, then restarts only its owned server with a local
benchmark preload. Bots, memory, tool counters, history, and native sessions live
in disposable directories. No UI or personal chat state is used.

## Automated checks

```sh
node node_modules/vitest/vitest.mjs run scripts/benchmarks/chat/benchmark.test.ts scripts/benchmarks/chat/runner.e2e.test.ts server/system-prompt.test.ts server/drivers/chat-mcp-tools.test.ts server/openai-tools.e2e.test.ts
```

Coverage includes experiment validation, deterministic pairing, assertion argument
matching, unknown/error reporting, normal prompt behavior, excluded-tool execution
rejection, request limits, live forwarding against an owned local stub, credential
redaction, and cancellation with saved partial reports and removed fixture state.

The existing OpenAI tools end-to-end test verifies normal production tool approval
and execution with no benchmark hook installed.

## Run the offline fixtures

```sh
node --experimental-strip-types scripts/bench-chat.ts run benchmarks/chat/experiments/smoke.yaml --fake --out artifacts/chat-bench/verification-smoke
node --experimental-strip-types scripts/bench-chat.ts run benchmarks/chat/experiments/smoke.yaml --fake --engine openai-compatible --out artifacts/chat-bench/verification-compatible
node --experimental-strip-types scripts/bench-chat.ts run benchmarks/chat/experiments/memory.yaml --fake --repetitions 1 --out artifacts/chat-bench/verification-suite
```

Use a new output directory for each run. Smoke should exit **2**, with the baseline
passing and the missing-tool variant failing `toolCalled`. That failure is
intentional. Every report must identify fake results as harness verification only.

The complete memory experiment should run 36 trials. The current scripted suite
has 33 passes and three expected restricted-memory failures: durable memory with
memory off, and corrected memory with empty/off memory. The empty-memory
correction deliberately tries to replace a nonexistent prior fact and receives
the real memory tool's conflict. This is an execution failure, not a claim that
a real model would make the same mistake.

Inspect each trial's `trace.json`, `provider.jsonl`, and `events/`. Evidence should
show pinned send/wait/messages commands, the actual received prompt and catalog,
tool arguments/results, memory snapshots, and separate task IDs for fresh-session
turns. The runner stops its exact child before removing the disposable directory;
new traces include `fixtureRemoved` and the owned server PID.

## Last exercised — 2026-09-28

- Five automated test files passed, 62 tests total.
- Native offline smoke: passing baseline, expected tool-removal regression.
  Evidence: `artifacts/chat-bench/verification-smoke-2/report.md`.
- OpenAI-compatible offline smoke: same outcome.
  Evidence: `artifacts/chat-bench/verification-compatible/report.md`.
- Durable-memory fixture: seeded and initially empty memory saved and reused the
  fact in a fresh conversation; memory-off failed the expected checks.
  Evidence: `artifacts/chat-bench/verification-memory/report.md`.
- Full offline suite: all 36 trials completed, 33 passed, three expected
  restricted-memory failures, no infrastructure errors.
  Evidence: `artifacts/chat-bench/verification-suite/report.md`.
- Prompt update comparison: baseline/explicit instructions passed; removing
  standing instructions failed the expected dispatched-prompt assertion.
  Evidence: `artifacts/chat-bench/verification-prompts/report.md`.
- Tool comparison: baseline and changed description completed their lookup;
  removing fixture tools failed the expected call assertion.
  Evidence: `artifacts/chat-bench/verification-tools/report.md`.
- Saved-result comparison written to
  `artifacts/chat-bench/verification-comparison.md`.
- Server and benchmark TypeScript checks, focused lint, and patch whitespace
  checks passed. `pnpm` was unavailable in the agent shell, so verification used
  the equivalent Node entry points above.

Artifacts are local and gitignored. These runs did not call a paid provider and
do not prove real-model quality, billing, or current provider authentication.
Live forwarding was tested against a local HTTP stub; an explicitly invoked
`--live` run is needed to assess a real model. CLI engines, semantic judging,
team conversations, cache/cost accounting, and visual UI behavior are not covered.

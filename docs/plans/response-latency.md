# Response latency worklist

Target: a complete simple conversational reply within 3 seconds, measured from
request submission. Record first text separately. Distinguish cold starts from
warm follow-ups; report repeated samples rather than declaring success from one
fast reply. Model/network time is part of the end-to-end target.

Use disposable fixtures for all synthetic messages and permission checks. Never
benchmark by mutating the user's conversations. Preserve the existing dev profile.

## Baseline — 2026-09-26

Read-only inspection of the isolated-dev Chief conversation's latest greeting:

- Request to driver start: 6.825 s (exact preparation substage unknown).
- Driver start to native turn submission: 0.512 s.
- Native turn submission to completion: 5.907 s, including MCP startup.
- First text: 12.267 s after the request; completion: 13.244 s.
- Luna, high effort, fast service tier. 65,262 input tokens, 6,912 cached,
  21 output tokens including 7 reasoning tokens.
- Seven MCP integrations started; last ready about 2.8 s after submission.
- Eight full OpenMausBot instruction updates accumulated 125,204 characters.
- No memory pressure observed (about 18 GiB available, no swap used).

## Work stopped at user request — 2026-09-26

The user chose a different direction and requested wrapping up the speed work.
Keep the verified/deployed optimizations. The three-second target is not proven:
retained sessions typically complete simple replies in 1–2.5 seconds, with a
4.323-second outlier; cold starts remain above target. The tested driver-only
preparation primitive remains unused. An unfinished HTTP preparation route was
removed before verification or deployment; no UI preparation flow was enabled.
The remaining items below are a backlog, not ongoing work.

## Worklist

- [x] Vite recursively watched downloaded agent checkouts, causing repeated UI
  reloads and an ENOSPC watcher crash that stopped the dev app. Exclude
  `local-agents` and `.omb-scratch` from the app watcher; verify dev startup.
- [x] Computer credential rotation invalidates retained Codex processes.
  Add request-scoped credential refresh to supported computer bridges, preserving
  revocation and in-flight request ownership; verify two turns reuse a process.
- [x] Auto VM discovery performs desktop health checks and screenshot capture
  before chat. Defer desktop checks to the first computer call; retain container
  identity, isolation, ownership and full first-use readiness validation.
- [x] Dynamic context causes full developer-instruction blocks to accumulate.
  Separate standing rules from per-turn context; verify memory, teammate results,
  instruction edits, and session recovery remain correct.
- [ ] Preparation consumed 6.825 seconds without stage-level timing.
  Instrument setup, resource wait, VM readiness, provider dispatch, first text,
  and completion; optimize the measured slow stages. Initial stage logging is
  deployed; observe a real dev turn with its actual integrations next.
- [ ] Personal Codex MCP configuration adds unnecessary startup/tool context.
  Added explicit per-engine `disabledUserMcpServers` and `nativeApps` settings.
  Measure the deployed exclusions of duplicate desktop/browser/REPL servers;
  native Codex Apps remain enabled in the dev profile.
- [x] Session resume returns history the adapter does not consume.
  Check installed protocol support and use bounded metadata-only resume.
- [ ] Existing sessions retain obsolete instruction blocks.
  Design explicit safe compaction after preventing new accumulation.
- [ ] High reasoning is configured for ordinary chat.
  Compare supported lower-effort settings on representative isolated requests;
  retain quality and do not attribute all latency to reasoning.
- [ ] Delegated answers require multiple model turns.
  Measure the critical path; parallelize only independent work and bound results.
- [ ] Warm/cold live-model benchmark and regression evidence.
  Track full latency, first text, startup count, context size, and cache usage.
- [x] Initial context injection added about 1.2 seconds before model processing.
  RPC timing isolated 1.190 s in the initial `thread/inject_items`, versus 96 ms
  initialize, 8 ms config read, 34 ms thread creation. Initial context now travels
  in thread creation; subsequent changes still use history updates. Session
  readiness dropped to 0.130–0.178 s, but cold end-to-end latency still varies.
- [ ] Native startup preparation remains on the first-reply path: new local
  OTel captures report 2.010–3.750 s in `startup_prewarm`, compared with
  0.570–0.663 s reported inference for those first replies. These timers overlap
  other stages; do not sum them as independent costs. Investigate native session
  preparation before a user send while retaining revocation and current rules.
- [ ] Warm provider/cache variability can exceed the target despite a retained
  process. A later warm sample completed in 4.323 s with 11,008 cached input
  tokens, versus roughly 17,152 in earlier warm samples. Do not infer causation
  from this single cache observation or promise a universal warm latency bound.
- [ ] Prepare the selected chat before a real message. The Codex adapter now
  has a separate `prepareSession` operation: no `turn/start`, no chat events,
  denied permission requests, absent revocable app credentials, normal
  permission revalidation on the real send, and two-minute cleanup for unused
  prepared sessions. Driver tests cover reuse and Stop races. This is not yet
  wired to an app route or UI and has no claimed end-to-end speed gain. Next:
  share context/tool preparation with real dispatch, handle selection changes
  and revocation, then verify the whole workflow in an isolated fixture.

## Results and decisions

- Tested Codex 0.157.0 from a separate npm installation in
  `.omb-scratch/latency-codex-0157`; the real dev app stays on 0.156.1. Fresh
  reply completed in 3.824 s; three restarted-runtime replies in 5.825, 3.840
  and 3.439 s. Upgrading alone did not solve the measured startup delay.
  Evidence: `/tmp/openmausbot-verification-evidence/server-1790426217367-430020.log.latency.json`.
  Future benchmark evidence records the tested executable and version directly.
- Preparation must be a distinct operation, not an empty conversational turn:
  the existing dispatch path appends user history, marks the thread working,
  grants turn credentials and may claim a computer. Keep those effects behind
  real message admission. The new adapter primitive is deliberately not enabled
  in the live app before an application-level integration can preserve this.
- Preparation implementation checks: 148 driver and isolated server/session
  regression tests passed. Nine focused preparation cases cover same-process
  reuse with refreshed credentials, current permissions, no startup grants,
  pending/completion-boundary Stop, failed setup, unused-runtime expiry, and
  preserving existing instructions. Existing real conversations retain their
  normal idle lifetime. These do not yet prove an HTTP/UI preparation workflow
  or its latency benefit.
- Latest continuation made progress by measuring native startup phases and
  separating fresh-account cold starts from runtime restarts with saved history.
- Native startup breakdown: 2.707 s building tools, then 1.311 s preparing the
  WebSocket connection; total native preparation 4.024 s. Cold completion
  6.185 s; warm completion 4.323 s. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790425838327-417228.log.latency.json`.
  This is the first measured warm miss; earlier sub-three-second observations
  remain samples, not a guarantee.
- Isolated native Apps opt-out with phase timings: tool preparation 0.176 s,
  connection preparation 1.223 s; cold completion 3.539 s, warm 1.075 s.
  No live Apps setting changed. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790425899820-419786.log.latency.json`.
- Added `--restart-between-turns` to replace only the fixture's idle Codex
  engine, retaining its provider home and the same native conversation. Verified
  four initializations, one native thread creation, three resumes and zero
  instruction injections. Fresh-home first reply: 4.854 s; restarted-runtime
  replies: 3.462, 3.801 and 3.346 s. Preparation after restart was 1.290–1.920 s;
  saved tool caches reduced tool building to 0.298–0.468 s. A fresh empty home
  overstates normal restart tool startup, but restarts still miss three seconds.
  Evidence: `/tmp/openmausbot-verification-evidence/server-1790425935120-421817.log.latency.json`.
- A fixture-only model-catalog transport preference did not switch the actual
  transport: native metrics still showed WebSocket requests/preparation, and
  cold completion was 7.043 s. Removed the probe rather than treating an ignored
  setting as an HTTP benchmark. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790425763378-414580.log.latency.json`.
- `--metrics` now collects native duration/count metrics through a temporary
  loopback-only OTel endpoint. App-server analytics are disabled by default;
  setting `analytics.enabled=true` in the disposable native home was required.
  The exporter points only at the fixture collector. No personal configuration
  is changed. Evidence omits account/resource attributes and raw payloads.
- Native diagnostic baseline: cold completion 6.224 s, warm 1.275 s;
  startup preparation 3.750 s, cold inference 0.598 s. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790425432222-399335.log.latency.json`.
- Tested supplying selected effort in thread-creation/resume config as well as
  turn/start. Native preparation was consumed, but cold completion still varied
  from 3.881 to 5.982 s; the latter run's warm completions were 1.213, 2.045,
  1.813, 1.048 and 0.910 s. Reverted this experiment because it demonstrated no
  repeatable latency gain. Its 139 driver/session tests and server typecheck
  passed before reverting. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790425493966-402440.log.latency.json`
  and `/tmp/openmausbot-verification-evidence/server-1790425617019-409604.log.latency.json`.
- A proposed built-in HTTP transport override was rejected by native configuration:
  Codex 0.156.1 reserves `model_providers.openai` and refuses overrides. Verified
  the error in an empty temporary home, removed the experiment, and made no
  provider/authentication changes to the dev app.
- Continuation: previous goal turn made progress (tested fixes, live-model
  measurements, deployed dev changes and transcript-preserving compaction).
- Cold-start investigation and tool settings: 155 regression tests passed;
  follow-up context-preservation and native-tool exclusion cases passed. Server
  typecheck and changed-file lint passed. Installed Codex 0.156.1 was also probed
  in an empty temporary home: `-c mcp_servers.personal-probe.enabled=false` and
  `-c features.apps=false` were accepted by native `config/read`. Quoted dotted
  components are rejected by the CLI; fixed that incompatibility before leaving
  exclusions enabled. No personal configuration was changed.
- Initial-context optimization, Chief/high, six samples: cold 4.428 s; warm
  1.113, 1.195, 1.044, 2.540, 1.191 s. Session ready in 0.178 s; no initial
  `thread/inject_items`. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790424312517-354495.log.latency.json`.
- Repeat with detailed MCP timing: cold 3.572 s, warm 1.065 s. Session ready
  0.130 s; agents ready after 0.252 s and native Codex Apps after 0.865 s from
  first protocol frame. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790424384238-359519.log.latency.json`.
- Native Apps disabled in an isolated Chief/high fixture: cold 3.309 s; warm
  1.305, 1.550, 1.303, 1.654, 2.057 s. Native Apps are absent from startup;
  OpenMausBot's team MCP remains. This setting has **not** been applied to the
  user's dev profile. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790424508158-362957.log.latency.json`.
- The session-readiness reduction is measured, but cold replies still miss 3 s.
  Do not claim the same reduction in end-to-end latency: downstream MCP startup,
  uncached context and provider/network time remain on the first-reply path.
- Tried removing the bot-specific ID from the self-thread tool schema to improve
  cross-bot cache reuse. Two fresh runs still cached only 11,008 input tokens and
  completed cold replies in 4.380 / 3.945 s. Reverted the entire catalog experiment
  (including its tests); no tool-contract change retained without measured gain.
  Evidence: `/tmp/openmausbot-verification-evidence/server-1790424895887-379834.log.latency.json`
  and `/tmp/openmausbot-verification-evidence/server-1790424940781-382637.log.latency.json`.
- Deployed and enabled only these per-engine personal MCP exclusions in dev:
  `node_repl`, `playwright-brave`, `computer-use-linux`. Native Apps stay enabled.
  The settings API reported HTTP 200 after the corrected native probe; a hash
  comparison confirmed the personal `~/.codex/config.toml` was unchanged.
- Computer credential refresh: 223 tests passed across seven files, including
  driver reuse, revoked files, queued old credentials, and isolated real chat
  lifecycle. VM fixture now represents structural discovery accurately.
- Stable/volatile instruction split, Chief policy/roster split, metadata-only
  resume, and preparation-stage logs implemented. Context/session suite: 199
  passed. Final driver, Chief, VM and compaction fixture suite: 244 passed,
  one skipped. Server and app typechecks and changed-file lint passed.
- Live benchmark script: `scripts/bench-response-latency.ts`. Requires explicit
  `--live --codex /absolute/path/to/codex`; clones only file-based login into a
  disposable Codex home, mounts app team tools, saves timing/transcript evidence,
  and removes the fixture. It does not copy private chats or personal tools.
- Six real Luna/high samples: cold 5.509 s; warm complete replies 2.981,
  2.223, 1.911, 1.368, 1.580 s (median 1.911 s). Warm first text 1.014–2.228 s.
  One initialize, one native thread start, five resumes, one context injection.
  Input 16,898–17,738 tokens; later turns cached 17,152 tokens.
  Evidence: `/tmp/openmausbot-verification-evidence/server-1790423605325-311476.log.latency.json`.
- Six real Luna/low samples: cold 3.171 s; warm complete replies 2.146,
  1.334, 1.016, 1.357, 2.465 s (median 1.357 s). Warm first text 0.907–2.355 s.
  Evidence: `/tmp/openmausbot-verification-evidence/server-1790423767452-322975.log.latency.json`.
  No live bot's effort was changed; simple greetings are not a quality evaluation.
- Six real Chief Luna/high samples with four idle teammates: cold 3.417 s;
  warm replies 1.254, 1.698, 1.097, 2.289, 2.092 s (median 1.698 s).
  Evidence: `/tmp/openmausbot-verification-evidence/server-1790423897144-333088.log.latency.json`.
- Instrumented Chief repeat: cold session ready 1.263 s, complete 3.763 s;
  warm session ready 0.017 s, complete 1.238 s. App preparation was 4–11 ms.
  Evidence: `/tmp/openmausbot-verification-evidence/server-1790424046519-341709.log.latency.json`.
- **Target remains open:** the initial batch's sixteen warm follow-ups were below
  3 s in fresh isolated chats. None of its four cold-start runs met 3 s. Later
  measurements above still show warm replies below target and cold replies above.
  Existing large histories,
  computer/connector tools, and delegated work are not covered by those numbers.
- Manual safe compaction already exists (`POST /api/bots/:id/compact`): it retains
  the full app transcript and rebuilds provider context from summary plus recent
  messages. Do not delete old native rollouts to reduce context. No user's thread
  has been compacted as part of benchmarking. After isolated compaction checks
  passed, applied maintenance compaction to the idle dev Chief's 65,291-token
  conversation (HTTP 202). Original bot/session metadata backed up privately in
  `.omb-scratch/isolated-dev/latency-chief-before-compaction.json`; no synthetic
  user messages sent. Compaction completed, the thread is idle, and its visible
  compaction record is `2ae71fbb-6e25-4fb8-a681-8a8e63ff48e6`. Next-real-reply
  measurement remains pending; old token readings describe the previous turn.
- Correct dev workspace restarted with these changes at `http://127.0.0.1:5299`
  (server 18799), health checks pass. Expo remains on 8081.
- Existing uncommitted work already retains successful Codex runtimes and adds
  credential refresh for team/browser/connectors. Build on it without reverting
  unrelated changes.

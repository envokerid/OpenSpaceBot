# Parallel room drafts and a single judge

Shared rooms (Chat and Goal) collect one proposal from each active member in
parallel. A proposal contains a brief public reason and that member's exact,
ready-to-post message (up to 8,000 characters). A member can instead propose
`task_complete` with an empty message. Members cannot nominate another bot.

After every proposal arrives, the room's selected judge reads the chat and all
current proposals, chooses one submitted message or `task_complete`, and records
a brief reason with `select_response`. The selected text posts verbatim under
its author's identity. There is no voting, tie-break stage, or additional working
turn. Another round then considers the updated chat. Automatic judge selection
uses the first active member's model. Invalid proposals or judge decisions pause
without inventing a reply; Stop and changed context invalidate pending decisions.

Each member receives posted chat plus only its own past proposal reasons and
drafts. Private feedback says “I was thinking …; I wanted to say …” for drafts,
and “I was thinking …; I said …” only once the selected message actually posts.
Other members' reasons and unselected drafts are excluded. Member proposal
sessions resume in separate journals so old voting sessions containing shared
proposals cannot leak into the new private history.
The judge keeps a durable native/API conversation, including previously rejected
drafts and reasons, across rounds and subsequent human messages in the same room
task. Its history is append-only to preserve the cacheable prefix; provider/model
changes replay the portable history. Its tool schema remains stable as allowed
candidates change, while the server validates the current candidate set. Actual
cache reuse still depends on the provider. Desktop and Expo show animated three-dot bubbles while proposals or judging
are pending, including when discussion cards are hidden. Dots stop on completion,
pause, or Stop. Drafts and decisions remain persisted
in discussion cards for audit; old cards with votes remain readable.

Run the isolated workflows from the repository root:

```sh
node_modules/.bin/vitest run server/room-election.test.ts server/room-election-inference.test.ts server/room-election-providers.test.ts server/room-election.e2e.test.ts server/room-election-codex.e2e.test.ts --maxWorkers=2
OMB_UI_E2E=1 node_modules/.bin/vitest run scripts/testing/room-election-ui.e2e.test.ts --maxWorkers=1
```

The workflow tests use `launchVerificationServer`, drive its explicit fixture
URL, retain request/transcript/inference evidence beside its log, and stop only
the owned child. Coverage includes parallel proposal barriers, exactly one judge
per valid round, exact message posting and attribution, rejected-draft isolation
between members, personal draft/posted feedback, and retention for the judge, native judge session continuity,
selected models and usage, Stop during proposals and judging, changed context,
Resume, repeated-reply limits, bot-posted requests, Chat and Goal sends, and
follow-up requests. Codex and ACP transport checks use real adapters with fake
native processes. These checks do not establish real-model response quality or
provider cache hit rates.

## Current verification evidence — 23 September 2026

The staged commit passed 160 checks across nine focused suites, seven turn-tail
checks, six Expo typing checks, and the isolated desktop UI workflow. Server, desktop and Expo type checks also passed.
The Expo changes were not driven on a phone/simulator. Evidence:

- `/tmp/openmausbot-verification-evidence/server-1790146945567-3020004.log.room-election.json`
- `/tmp/openmausbot-verification-evidence/server-1790146979765-3024381.log.room-election-codex.json`
- `/tmp/openmausbot-verification-evidence/server-1790146977820-3024113.log.room-election-ui.json`
- `/tmp/openmausbot-verification-evidence/server-1790146977820-3024113.log.room-election.png`

## Historical verification (superseded flow)

The records below describe the previous voting/working-turn implementation.
They are retained as historical evidence and do not describe the current flow.

### Previous parallel voting flow

Shared rooms now use elections for both legacy Chat and Goal requests. Direct
bot conversations and bot-to-bot channels retain their separate routing.

Each round collects proposals and public reasons from every active member in
parallel, then shares all proposals before starting independent parallel votes.
Votes contain only a candidate. A unique plurality elects the speaker; a tie
invokes the room's selected judge model, restricted to the tied top candidates
(including `task_complete`). The judge must submit a public reason. Group details
on desktop and Expo can select the judge provider and model. Automatic uses the
first active member's model. Missing or failed judges pause without inventing a
winner. Failed parallel batches abort and drain their siblings before returning.
All proposals, reasons, votes and judge decisions remain in persisted room
history and are supplied to subsequent elections and elected working turns.
The current unfinished round is excluded from its own history snapshot.
The elected member contributes, and another round starts with updated history.
Electing `task_complete` ends the discussion. Invalid or missing submissions,
failed speakers and bounded-run limits pause it. Desktop and Expo group
transcripts show the discussion card by default, including its inline Resume
action when the discussion is paused. A device-level Settings switch can hide
or restore those cards without changing persisted discussion history.

## Provider transport

`room-election-inference.ts` uses the existing provider adapter and agents MCP
integration. Each phase gets a private event-routing thread, the bot's selected model,
an empty temporary working directory, Ask permissions, and exactly one app
tool: `submit_proposal`, `cast_vote`, `resolve_tie`, or `submit_summary`. A private loopback
endpoint scopes the capability to one phase and validates candidates, reasons,
duplicate submissions and expiry. Private runtime events are excluded from
the chat event bus. Assistant prose cannot substitute for a submission.

The private routing ID is not a new model conversation. Each room task/member
now owns a durable history and native resume cursor, shared by proposing,
voting and elected working turns. New human messages and new election cards
never clear it. A judge has its own durable history in that room. Summary
helpers remain independent of members' conversations.

This supports drivers advertising `agentsMcp`, including Claude, Codex, Pi,
ACP and the OpenAI-compatible family. It does not require a new inference
method for each engine. The legacy Box driver has no agents MCP transport and
pauses explicitly. Native provider tools are not universally removed: no app
working integrations are mounted, and non-election permission requests are
denied, but this is not an OS sandbox or a guarantee of zero native reads.

The elected contribution uses normal working tools and permissions. Addressed
assignments into shared rooms are refused. A room member also cannot be assigned
into its direct thread by this room or by an external specialist acting for
this room. The member must contribute in its own elected public turn. External
direct coordination with nonmembers parks
the election until downstream work and the elected member's follow-up finish.
Bot posts wake elections while retaining authorship and shared loop budgets.

## Isolated checks

Run from the repository root:

```sh
node_modules/.bin/vitest run server/room-election.test.ts server/room-election-inference.test.ts server/room-election-providers.test.ts server/room-election.e2e.test.ts --maxWorkers=2
node_modules/.bin/vitest run server/harness/bus.test.ts server/channel-queue.test.ts server/room-turn-timeout.test.ts server/drivers/agents-catalog-wire.test.ts server/drivers/openai-chat.test.ts src/components/GoalRunCard.test.ts src/lib/group-routing.test.ts --maxWorkers=2
OMB_UI_E2E=1 node_modules/.bin/vitest run scripts/testing/room-election-ui.e2e.test.ts --maxWorkers=1
```

The server workflow test launches `launchVerificationServer`, drives its
explicit URL, retains evidence beside the fixture log, then stops its exact
child and removes its temporary data. It covers Chat and Goal compatibility,
all-proposals-before-votes, changing conversation context, Stop, invalid
submissions, Resume, external delegation, bot-posted messages, judge selection,
tie resolution, Stop during judging, candidate-only ballots and election history.
The provider tests use the real Codex and OpenCode ACP adapters with fake
native processes and real MCP proxies in temporary homes. Unit checks cover parallel launch, phase barriers, tied candidate restrictions,
required proposal/judge reasons, candidate-only ballots,
MCP phase/authentication/duplicate validation, cancellation and permission
denials.

The UI test launches `control-omb ui launch`, sends through the actual desktop
composer, selects a judge in group details, verifies the public reply and
discussion card, expands the card details, toggles card visibility off and on
in Appearance, and checks that proposals, votes and the judge reason remain in
the persisted transcript. It saves a screenshot plus the transcript.
This Linux environment required a temporary Chrome wrapper adding
`--no-sandbox`, passed only to the isolated test through
`AGENT_BROWSER_EXECUTABLE_PATH`. It did not use the user's browser or app.

The card visibility switch passed in an isolated desktop fixture on 23 September
2026. The final, hidden and restored accessibility snapshots, API transcript,
and screenshot are saved beside the fixture log:

- `/tmp/openmausbot-verification-evidence/server-1790143439968-2878757.log.room-election-ui.json`
- `/tmp/openmausbot-verification-evidence/server-1790143439968-2878757.log.room-election.png`

Observed passing desktop evidence on 23 September 2026:

- `/tmp/openmausbot-verification-evidence/server-1790130455244-2155657.log.room-election-ui.json`
- `/tmp/openmausbot-verification-evidence/server-1790130455244-2155657.log.room-election.png`

Type checks cover the server, desktop and Expo. The restored card presentation
has not been driven on a phone/simulator. Deterministic
fixtures establish orchestration behavior, not the quality of real-model
speaker choices. Live-provider election behavior, large-history summarization
quality, and scheduled-run completion notifications need further acceptance
testing; do not describe those as verified by these checks.

Final focused regression run: 100 tests across 11 files passed. Following the
pooled-session cleanup, all 18 election tests and the desktop UI workflow
passed again. Server, desktop and Expo type checks passed; targeted lint and
`git diff --check` were clean. This was not a full repository test-suite run.

## Follow-up message regression

A real conversation exposed a false loop detection: two elected members gave
identical greetings, so the previous global text comparison paused the run.
The fixture reproduced that failure before the fix. Repetition is now checked
per speaker and per incoming message. Different speakers may give the same
requested answer, and a new message permits the same speaker to answer again.
A speaker repeating unchanged output without new input still pauses.

Queued follow-ups get a new voting receipt below the latest accepted message.
The previous receipt links to that continuation; the operation retains its
reply/time budget and routine identity. Tests cover three identical greetings,
a second message after completion, a second message during an active election,
new input after a repeated-output pause, and the retained no-input loop guard.

Parallel/judge revision verified on 23 September 2026: 25 election tests, a
separate Stop-during-judge fixture, 121 related regression tests, and the real
desktop selector/tie decision UI passed. Server, desktop and Expo type checks
passed. Expo settings were type-checked, not driven on a native device.

- Server workflow results: `/tmp/parallel-election-tests-2.txt`; detailed fixture evidence remains beside its isolated server log.
- Desktop UI evidence: `/tmp/openmausbot-verification-evidence/server-1790132627585-2292508.log.room-election-ui.json`.
- Additional results: `/tmp/parallel-judge-stop.txt`, `/tmp/parallel-regressions.txt`.


Concurrency recheck (23 September 2026): timestamped isolated native processes
prove all three proposals overlap and all three votes overlap, with a full
proposal barrier between phases. In the HTTP fixture, first-round proposal
starts were 29 ms apart and voting starts were 10 ms apart; overlap was 899 ms
and 943 ms respectively. The test uses an artificial 800 ms engine delay;
these measurements verify overlap, not real model latency. A separate test
proves the same overlap through three private threads on one Codex adapter.
The live app had still been running the pre-update process, and its latest
receipt contained the legacy constrained final ballot.

Reproduce with:

```sh
node_modules/.bin/vitest run server/room-election.test.ts server/room-election.e2e.test.ts -t 'starts all proposals together|overlaps all three native' --maxWorkers=2
node_modules/.bin/vitest run server/room-election-providers.test.ts --maxWorkers=1
```

Evidence: `/tmp/openmausbot-verification-evidence/server-1790133025005-2331979.log.room-election.json`.
Results: `/tmp/election-overlap-check.txt`, `/tmp/election-codex-overlap-check.txt`.


Public-discussion routing regression (23 September 2026): Trench's elected
Notion speaker used `coordinate_bots` to request Brand and Brainstorm's views in
their direct threads, resuming repeatedly as their spokesperson. The initial
parallel election was valid; private delegation delayed the next election.
The server now rejects room-member delegation by ID/name before any work or
approval is dispatched, rejects mixed recipient batches atomically, and carries
the restriction through an external specialist's handoff ancestry. Ordinary
direct conversations retain their coordination behavior. Room prompts direct
members to publish substantive elected replies; proposal reasons and private
reports do not count as a member delivering its requested public contribution.

The isolated `keeps a room discussion public` workflow attempts the bypass and
then records three separately elected public replies without changing any
member's direct transcript. The external-specialist workflow also attempts an
indirect member handoff and verifies it is refused while legitimate external
work still returns normally. Results: `/tmp/room-public-replies-e2e.txt`,
`/tmp/room-public-replies-verified.txt`, `/tmp/room-public-regressions.txt`, and
`/tmp/room-public-catalog.txt`.

The broader direct-coordination suite exposed a fixture race: after room posts
started elections, its branch-edit request could collide with the bot's room
turn (409). That test now elects completion for notification posts and waits
for the room operation before testing branch authority. The targeted test
passes (`/tmp/room-public-direct-fixed.txt`); the other 67 checks in that run
passed. Catalog checks (25), server type checks, and both public/indirect
routing workflows pass. No test messages were sent into Trench.

## Per-member conversation continuity (23 September 2026)

`room-bot-history.ts` saves a private, atomically replaced journal for each
room task/member under `room-bot-histories/`. Requests, assistant messages,
tool event previews and accepted election submissions append in observed
order. Earlier entries are never rewritten when election cards change.
The native cursor is retained across phases and human messages, including
interrupted ballots. Working turns release the previous room transport before
resuming the elected member's own cursor. Deleting a room task or bot removes
its associated application journals.

Native drivers retain their full tool protocol in their native sessions.
OpenAI-compatible drivers checkpoint the exact non-system message array,
including tool-call IDs/results and provider-supplied reasoning fields, and
restore that array before the next request. On model/provider changes the
portable journal is replayed; missing ACP/Pi sessions also receive recovery
history rather than only the latest instruction. Portable native recovery
contains tool event previews, not a reconstruction of unavailable raw native
protocol. Failure to read a saved journal pauses rather than discarding it.

This implements per-bot continuity. Current room snapshots still arrive in
new request messages, and system prompts/MCP tool catalogs still change by
phase. It does not implement the separately proposed immutable public event
log, delta-only room delivery, stable tool catalog, or compaction checkpoints.
Consequently these checks do not prove production cache-hit rates. Native
sessions may compact their own context; API contexts remain subject to their
model's context limit.

Reproduce the focused checks:

```sh
node_modules/.bin/vitest run server/room-bot-history.test.ts server/room-election.test.ts server/room-election-inference.test.ts server/room-election-providers.test.ts server/room-election.e2e.test.ts server/drivers/openai-chat.test.ts server/drivers/acp/acp.test.ts server/drivers/pi.test.ts server/store.test.ts --maxWorkers=2
node_modules/.bin/vitest run server/drivers/codex.test.ts server/drivers/codex-instructions.test.ts --maxWorkers=2
node_modules/.bin/tsc -p tsconfig.server.json --noEmit
```

The isolated HTTP workflow proves distinct member cursors, an unchanged saved
history prefix, continuation through a second human message, and journal
cleanup on room deletion. Module tests reopen histories from disk and cover
interrupted ballots, concurrent-turn refusal, provider changes and room/member
separation. API-driver tests compare the next request's actual tool protocol
with its saved prefix. Real Codex/OpenCode adapters with fake native processes
exercise cursor continuation; ACP/Pi tests exercise missing-session replay.

Results: `/tmp/room-history-verified.txt` (284 checks passed; the new Pi test
initially referenced a nonexistent fixture variable), followed by
`/tmp/room-history-final-followup.txt` (all 170 Pi/store/HTTP checks passed after
fixing that fixture). `/tmp/room-history-codex.txt` records 133 passing checks.
`/tmp/room-history-native-verified.txt` records 88 passing ACP/provider checks
after teaching the fake ACP process to mount supplied MCP servers on resume.
All checks used disposable data; the running app was not reloaded.

## Codex pauses after a successful vote (23 September 2026)

The recent per-member continuity change exposed an instruction-cache error.
Private election routes and the public room route resume the same Codex native
session, but the instruction receipt was keyed by the application route. A
later speaking turn could find its old matching receipt and skip the native
developer update, leaving the latest voting instruction prohibiting public
messages. Read-only diagnostics from Trench Test showed the first speaking
turns injecting their instructions; later turns skipped injection and Codex
returned empty agent messages with a successful completion. The room correctly
paused because it had no delivered reply.

Receipts now follow provider instance plus native session, with a new namespace
so existing sessions receive an adoption update. Every actual change between
private and public instructions updates the native history; consecutive turns
with identical instructions still avoid duplicate updates.

`room-election-codex.e2e.test.ts` launches an isolated server with the real
Codex adapter and a fake native process that retains its effective developer
message across restarts. It reproduces the empty second reply before the fix.
After the fix, two elections choose the same speaker, both public replies are
delivered, and a new human message receives a third reply using the original
member cursors. The simulated provider behavior is based on the observed
native protocol; no authenticated model call or mutation of Trench Test is
part of this verification.

```sh
node_modules/.bin/vitest run server/room-election-codex.e2e.test.ts server/drivers/codex-instructions.test.ts server/drivers/codex.test.ts server/room-election-providers.test.ts --maxWorkers=2
node_modules/.bin/tsc -p tsconfig.server.json --noEmit --pretty false
```

All 137 focused checks and the server type check passed. Evidence:

- Before fix: `/tmp/openmausbot-verification-evidence/server-1790144159031-2917279.log.room-election-codex.json`
- After fix: `/tmp/openmausbot-verification-evidence/server-1790144215932-2924512.log.room-election-codex.json`
- Test output: `/tmp/discussion-resume-regression.txt`

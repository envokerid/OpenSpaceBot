# Codex sessions waiting between messages

Codex keeps one live app-server process per conversation after a successful
reply. Its stdin remains open and its startup handshake runs once. Follow-up
messages use that process and native history, including after long idle gaps.
This does not submit dummy prompts or cache replies. The first message after
startup still creates the conversation's runtime.

Resetting context, changing the process configuration, an interrupt, a failed
turn, account changes, deletion, and shutdown release the runtime. A tool whose
credentials cannot be refreshed also requires a restart when they change.
Team, browser, connector, and gated computer proxies snapshot the current turn's credential
from a private file for each request. In-flight requests keep their original
credential; completion removes the file and revokes that turn's authority.

Run these checks:

```sh
pnpm exec vitest run server/drivers/codex.test.ts server/drivers/agents-proxy.test.ts server/browser-proxy.test.ts server/connector-proxy.test.ts server/codex-session.e2e.test.ts
```

The end-to-end test launches an isolated fake-engine server through
`launchVerificationServer`, following [README.md](README.md). It uses the
mapped `doctor`, `new-bot`, `models`, `set-model`, `send`, `wait`, and `messages`
commands with the fixture's explicit URL. Two messages must settle and appear
in the transcript. Both use the same process, with one `initialize` and two
`turn/start` calls, and both exercise the real injected team-tools proxy after
credential rotation. The fixture is then stopped and removed.

The persistent server log has a sibling `.codex-session.json` evidence file
containing the command sequence, wait results, bounded transcript and process
reuse result. No real account or browser is launched. These checks prove local
process reuse, not the response latency of a live model or network.

## Latency investigation

Standing rules and changing task context have separate receipts. Initial context
travels in `thread/start`, avoiding a separate synchronous history injection.
Context changes
append only a small developer snapshot; unchanged context is not appended again.
The Chief's standing coordination policy is separated from its roster and runtime
status. Native resume requests ask for metadata only (`excludeTurns: true`).
Resume configuration still carries the complete current rules and context for
native compaction. A standing-rule replacement reasserts the current context.

`PATCH /api/instances/:id` accepts two explicit Codex tool settings:

- `disabledUserMcpServers: ["name"]` disables matching top-level server tables in
  that account's `config.toml` only for this engine's launches. App-mounted tool
  names are protected, and an app-selected custom server with the same name
  retains its separate mount. Unknown names are ignored. Inline/project/plugin
  declarations are not scanned by this option.
- `nativeApps: false` disables Codex's native Apps integration for this engine.
  OpenMausBot's own team and connected-app MCP integrations remain separately
  selected. The default is to inherit native Apps; setting `true` restores it.

Neither option edits personal Codex configuration or signs out an account.
The settings route refuses changes while that engine is busy. The driver tests
and `server/codex-fast-mode.e2e.test.ts` cover arguments, unchanged personal
config, persistence, validation and restoring defaults.

Auto Local VM selection inspects container identity/isolation without capturing
the desktop. The first computer call still claims ownership and runs full desktop
readiness checks. Explicit VM selection retains its eager validation.

```sh
pnpm exec vitest run server/drivers/codex-instructions.test.ts server/chief-of-staff.test.ts server/system-prompt.test.ts server/group-local-vm.e2e.test.ts server/mcp-bridge.test.ts server/local-computer-proxy.test.ts
```

An explicitly requested live-model latency benchmark uses the same isolated
fixture, with a private copy of `auth.json` but no personal configuration or chat
history. It consumes real provider requests. Example:

```sh
node --experimental-strip-types scripts/bench-response-latency.ts --live --codex /absolute/path/to/codex --model gpt-6-luna --effort high --samples 6 --chief
```

`--chief` adds a Chief and four idle synthetic teammates. Evidence is retained
beside the server log as `.latency.json`, including exact commands, wait results,
bounded messages, first-text/completion times, token usage and native startup
counts. Timings use event timestamps, excluding CLI polling delay. `[turn-latency]`
server log entries break preparation into context, integrations, checkpoint and
provider dispatch stages without recording prompts or credentials.
`--no-native-apps` exercises the per-engine native Apps opt-out. Evidence also
records RPC durations and MCP startup statuses without credentials or payloads.

`--restart-between-turns` replaces the fixture's idle Codex engine between
samples while preserving its native home and conversation cursor. It checks
that every sample initializes a new runtime and later samples resume the same
native conversation. `startKind` distinguishes fresh-home/chat startup,
restarted runtimes with saved caches, and retained runtimes. Engine replacement
finishes before message submission; reply timings still include native process
startup, session resume and provider preparation.

`--metrics` additionally enables native analytics in the disposable home and
routes its OTel metrics to a temporary loopback collector. It retains selected
duration/count metrics and bounded startup phase/outcome labels, omitting resource
identity, account attributes and raw payloads. The collector remains alive until
fixture shutdown so native metrics can flush. This does not enable telemetry or
change configuration in the user's real Codex home.

Fresh warm chats do not prove cold-start, old-history, computer-tool or delegated
response latency. Track these separately in [the latency worklist](../plans/response-latency.md).

## Session preparation work in progress

The optional Codex adapter `prepareSession` operation performs native setup
without `turn/start` or canonical chat events. It rejects active/unrevocable
app bridge credentials and refuses native permission requests during setup.
A real send revalidates its current instructions, permissions and launch
contract. Stop cancels a real send waiting on preparation, including the
completion boundary; unused prepared runtimes expire after two minutes.

The driver contract tests exercise these invariants. The operation is not yet
called by an HTTP route or UI: the current server fixture tests validate normal
chat/session regressions, not a complete prepared-chat workflow. Before enabling
it, add an isolated mapped workflow that proves no user messages or authority
exist during preparation, then measures the first actual reply and verifies
settings changes, cancellation, deletion and account replacement.

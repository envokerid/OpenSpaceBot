# Approved MCP commands

Run the focused checks from the repository root:

```sh
pnpm exec vitest run shared/approved-commands.test.ts server/auto-approve.test.ts server/approved-commands.e2e.test.ts companion/test/settings.test.ts src/components/ApprovedCommandsSettings.test.ts
pnpm exec vitest run server/drivers/claude.test.ts server/drivers/codex.test.ts server/drivers/openai-chat-tools.test.ts server/drivers/acp/acp.test.ts server/decision-log-wiring.test.ts
pnpm typecheck
npm run typecheck --prefix expo
```

`server/approved-commands.e2e.test.ts` launches the repository's fake-engine
server with a temporary data directory, creates one fixture bot, reads the
administrator settings endpoint, revokes the built-in
`composio_multi_execute_tool` approval, grants a second MCP tool, and confirms
the resulting bot policy. A second fixture opens the real Claude permission
broker, proves the default command is answered automatically, revokes it, and
proves the next identical call produces a human approval card. It then answers
that card through the real thread route. Each test closes the exact child it
launched and removes its temporary workspace.

The settings fixture also grants selected bots, rejects a batch containing an
unknown bot without saving any grants, approves all existing bots with and without
the future-bot default, and creates later bots to check inheritance. Disabling
the future default preserves existing grants and individual revocations. Defaults
are persisted in config.json. MCP approval prompts on desktop and Expo expose
“Approve for bots…”; “All current bots” offers “Also approve for all new bots”.
Approved commands settings can change this future-bot default later.

The unit checks cover default aliases, explicit revocation, sandbox widening
and question exclusions, the desktop page's accessible controls, and the
paired-phone settings allowlist. Provider regression suites check that
synchronous approval delivery remains valid across Claude, Codex, ACP engines,
and the OpenAI-compatible MCP runtime. Expo's type check covers the native page
and its shared wire contract.

This fixture uses fake providers and does not call a live MCP server, Composio
account, desktop app, or phone. Native layout still requires the disposable
emulator workflow in `expo/verification/settings.md`.

# Native provider accounts and agent

OpenMaus Agent connects provider accounts directly to OpenMausBot's existing
conversation and tool loop. Open Settings → Engines → OpenMaus Agent, select a
provider, connect it, then choose its model for a bot. Setup is also available
from the model picker. No Hermes process, CLI installation, or Hermes credential
import is involved.

## Source review and scope

The local Hermes source at revision
`d0288be5b3330d2442e3907185b8e9d0958297bb` was reviewed, particularly
`hermes_cli/auth.py`, `auth_constants.py`, `auth_codex.py`,
`auth_codex_browser.py`, `auth_device_flow.py`, `auth_nous.py`, `auth_xai.py`,
`auth_openrouter.py`, `auth_qwen.py`, `auth_minimax.py`, and
`agent/codex_responses_adapter.py`. Attribution is in
[the Hermes auth notice](../../third_party/hermes-auth/NOTICE.md).

| Provider | Native account method | Inference protocol |
| --- | --- | --- |
| ChatGPT | Device challenge, authorization-code exchange, refresh | Codex Responses |
| Grok subscription | OAuth discovery, device grant, refresh | Responses |
| Nous Portal | Device grant, scoped inference token, header-based refresh | Chat completions |
| OpenRouter | Browser authorization with PKCE; paste returned code | Chat completions |
| Anthropic, MiniMax | API key | Messages |
| OpenAI API, Google AI Studio, xAI API, DeepSeek, Z.AI, Qwen Cloud, Groq | API key | Chat completions |

This is a focused port, not full Hermes provider parity. Qwen CLI OAuth,
Anthropic subscription login, Copilot and MiniMax OAuth are not implemented by
this driver. Existing CLI engines remain separate. Provider acceptance of
public OAuth clients and model availability must be checked with a real account.

`shared/native-providers.ts` pins provider endpoints. The account module owns
sign-in, cancellation, refresh and per-provider disconnect. Credentials are
stored in `provider-accounts/<instance-hash>.json` under the server's data
folder, using atomic replacement, a private directory and mode 0600 files.
They are plaintext secrets protected by OS permissions, not an encrypted vault.
The UI/API receives account status and temporary login challenges, not tokens.
Login ownership uses the existing authenticated provider-session manager.
Refreshes are serialized within the owning server process; do not share one
credential file between independently running servers.

Model lists come from provider catalogs. The driver's `models` config can map
provider IDs to additional/fallback model IDs; MiniMax includes a small default
fallback because it may not expose a catalog. A key is checked against the
catalog endpoint when supported. A 404/405 saves the key without proving inference
access; the first inference request can still fail for credentials or billing.

`native/transport.ts` adapts Responses and Messages into the existing
`openai-chat.ts` runtime. The common runtime retains history, cancellation,
usage and structured tools with approval before execution. Custom stdio MCP,
agent coordination and OpenClaw use the same harness as the compatible API
engine. This change does not add computer, browser, image or CLI tool runtimes.
Truncated native streams fail; opaque Responses reasoning replay stays scoped
to its originating provider.

## Automated verification

Run from the repository root:

```sh
node node_modules/vitest/vitest.mjs run server/native-agent.e2e.test.ts server/drivers/native-agent.test.ts server/drivers/native/accounts.test.ts server/drivers/native/transport.test.ts server/drivers/openai-chat-tools.test.ts server/provider-auth-sessions.test.ts src/components/NativeAccountSettings.test.ts src/components/EngineSetup.test.ts src/components/EnginesSettings.test.ts
```

The server recipe launches `launchVerificationServer`, then restarts only its
owned child with a synthetic provider preload. The child has disposable data
and home directories. The preload intercepts fixed provider endpoints and
rejects all other external fetches. No real provider account is read or used.

The test records `control:omb doctor`, `new-bot`, `set-model`, `send`, `wait`,
and `messages`, plus API actions for account setup and approval responses. It
checks cancellation, ChatGPT device login, OpenRouter code exchange, Anthropic
API-key setup, discovered models, an approval pause before writing an artifact,
continuation after approval, account persistence after restart, and disconnect
without removing a different provider. Every write stays inside fixture data.

Evidence is printed as `<fixture-log>.native-agent.json` in the persistent
verification evidence directory, including commands and resulting transcripts.
Cleanup stops the exact child and removes only the fixture's disposable data.
Unit tests additionally cover refresh, credential permissions, untrusted auth
endpoints, tool denial/cancellation, helpers, and incomplete streams.

These checks prove synthetic wire-protocol and server behavior, not real
subscription eligibility or upstream service compatibility. UI verification is
automated/static; visual review is left to the user per AGENTS.md.

## Live latency benchmark

With explicit authorization to use a real account, run:

```sh
node --experimental-strip-types scripts/bench-native-response-latency.ts --live --model gpt-6-luna --cycles 3
```

This copies only the existing, unexpired Codex access token into a disposable
native account file. It does not import personal transcripts, tools or a refresh
token, and it does not update the source login. Each cycle restarts the fixture
server, creates a fresh Chief conversation, and measures one cold message plus
two follow-ups through `control:omb`. Server-ready time is recorded separately
and excluded from chat latency. No browser or desktop is launched.

The native driver's optional configuration
`instances.native.config.chatgpt = { "effort": "high", "fastMode": true }`
forwards ChatGPT reasoning effort and requests `service_tier: "priority"`.
Other providers and default configurations are unchanged. This is an explicit
server configuration option; it does not add a model-picker effort control.
The benchmark records requested and returned tiers separately: acceptance of a
priority request does not prove priority execution. If the returned tier is
`default`, `fastConfirmed` is false and the result must not be called a verified
fast-mode measurement. Evidence includes sanitized wire settings, token counts,
first text, completion, server readiness, and control transcripts.

[Measured GPT-6 Luna results, 2026-09-26](native-latency-2026-09-26.md).

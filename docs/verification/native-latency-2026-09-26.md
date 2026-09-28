# GPT-6 Luna response latency — 2026-09-26

Measured through isolated OpenMausBot servers with real ChatGPT requests and high reasoning. Codex fast mode was enabled. The native driver requested priority, but all nine final responses reported `service_tier: default`; its measurements are **not verified fast-mode results**.

| Driver/start condition | Samples | Median first text | Median full reply | Full reply range |
| --- | ---: | ---: | ---: | ---: |
| Native: first send after server restart | 3 | 1.81 s | 2.21 s | 1.95–2.43 s |
| Native: follow-up | 6 | 1.86 s | 2.36 s | 1.72–3.75 s |
| Codex: fresh home/chat | 2 | 4.08 s | 4.53 s | 3.59–5.47 s |
| Codex: restarted runtime, saved chat | 3 | 3.52 s | 3.81 s | 3.75–6.05 s |
| Codex: retained runtime | 5 | 0.89 s | 1.07 s | 0.94–1.65 s |

## Interpretation

The native driver had lower first-message latency in these samples. Retained Codex conversations were faster on follow-ups. This is an application-level comparison, not a controlled measurement of driver overhead: Codex had about 17–18k input tokens and native chat about 10k, with different tool inventories and instruction construction. Prompts and response lengths vary. These small samples do not establish p95 latency or a guaranteed response-time bound.

Native requests remount the MCP tools each turn. Native responses reported either 0 or 9,728 cached input tokens; Codex warm samples reported 17,152 cached input tokens. This is an observation, not proof of the cause of the latency difference.

Native cold samples are the first message in a fresh Chief chat after a full fixture-server restart. Server launch, model discovery and readiness time are excluded from the chat timer and recorded separately. Native warm samples are two follow-ups in the same server/chat. Codex cold samples distinguish fresh homes from process restarts that retain the provider home and conversation. Warm Codex samples reuse one live process.

## Method and evidence

Both benchmarks used disposable workspaces with the real team MCP bridge and synthetic conversations; no personal chat, computer or custom tools were attached. The native fixture copied only a still-valid access token, never a refresh token, from the existing Codex login. Source login files were unchanged. Every fixture was removed after stopping its exact owned processes. No browser or desktop was launched.

Final reported runs were executed separately. A preliminary native/Codex-restart pair overlapped; those results are excluded from this report. The alternate native wire value `service_tier: fast` returned HTTP 400 and was discarded. The implementation retains the Hermes-style `priority` request, records returned tiers, and does not claim priority execution when the server reports `default`.

Commands:

```sh
node --experimental-strip-types scripts/bench-response-latency.ts --live --codex /home/david/.local/bin/codex --model gpt-6-luna --effort high --samples 6 --chief --metrics
node --experimental-strip-types scripts/bench-response-latency.ts --live --codex /home/david/.local/bin/codex --model gpt-6-luna --effort high --samples 4 --chief --metrics --restart-between-turns
node --experimental-strip-types scripts/bench-native-response-latency.ts --live --model gpt-6-luna --cycles 3
```

Runtime for these commands: Node 24.16.0. Codex version: codex-cli 0.156.1. Evidence contains timings, token usage, transcripts, control commands and fixture log locations:

- [native](/tmp/openmausbot-verification-evidence/server-1790437927038-619069.log.native-latency.json)
- [codex_warm](/tmp/openmausbot-verification-evidence/server-1790437682089-606873.log.latency.json)
- [codex_restart](/tmp/openmausbot-verification-evidence/server-1790437883880-615180.log.latency.json)

The new native `chatgpt.effort` and `chatgpt.fastMode` configuration forwards explicit request settings for ChatGPT only. Defaults and other providers are unchanged. No live instance configuration was changed or restarted as part of this test.

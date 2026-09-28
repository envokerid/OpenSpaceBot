Provider authentication and Codex Responses protocol handling in
`server/drivers/native/` were adapted from patterns in Hermes Agent:
https://github.com/NousResearch/hermes-agent

Reference revision: `d0288be5b3330d2442e3907185b8e9d0958297bb`
(local checkout in `local-agents/hermes/source`).

Copyright (c) 2025 Nous Research. MIT license, reproduced in LICENSE.

OpenMausBot implements its own TypeScript account lifecycle and uses its own
conversation/tool harness. Hermes is not a runtime dependency.

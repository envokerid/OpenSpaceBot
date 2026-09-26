# Expo usage and prompt-cache stats

Open **Settings → Workspace settings → Usage**. The page has period tabs,
input/output token totals, reported cost, a cache-hit card and expandable
breakdowns by bot, model, engine, day or requester. Rows expand to exact token
counts and reporting coverage. Refresh, CSV export, entitled budget controls
and model pricing remain available. It uses the settings light/dark appearance.

Cache-hit rate is `cachedInput / cacheReportedInput`, weighted by input tokens,
not an average of per-turn percentages. Coverage is `cacheReportedInput / input`.
Unreported input is excluded from the rate and appears separately in the bar.
No reporting means **Unknown**, while an explicit zero cache count means a
measured 0%. Old servers without coverage fields also show an unknown rate.
Previously discarded cache counts cannot be reconstructed from old records.
CSV exports use an empty cache cell for unknown reporting and `0` for a
reported zero. Model/provider reporting limitations still apply.

The server now retains cache counts from proposal, vote and judge turns when
the driver supplies them. Input and turn coverage are returned for every
usage group. The isolated election workflow checks member and judge reporting.
No credentials or message text are added to the usage ledger.

## Reproduce

From the repository root:

```sh
node --experimental-strip-types --test expo/tests/usage.test.ts
node_modules/.bin/vitest run server/usage-ledger.test.ts server/usage-ledger-api.test.ts server/room-election-inference.test.ts src/components/UsageHistory.test.ts --maxWorkers=2
node_modules/.bin/vitest run server/room-election.e2e.test.ts -t judge --maxWorkers=1
node --experimental-strip-types expo/scripts/verify-settings.ts
node --experimental-strip-types expo/scripts/verify-usage-ui.mjs
npm run typecheck --prefix expo
npm test --prefix expo
node_modules/.bin/tsc -p tsconfig.server.json --noEmit
```

The UI recipe uses the installed `control-omb` browser tools, its own temporary
profile and an owned Vite server. It renders production Expo components using
synthetic data. It clicks period/group tabs and expands details, checks a 320px
layout for overflow, and saves light, dark, unknown and empty screenshots plus
an action record. The API and companion recipes each launch disposable servers;
no live URL or saved phone connection is used.

Verified 23 September 2026:

- UI screenshots/actions: `/tmp/omb-usage-ui-evidence-maEeVc/`.
- Companion settings evidence:
  `/tmp/openmausbot-verification-evidence/server-1790137967381-2753827.log.settings.json`.
- Usage API/ledger/inference/desktop regression checks: 19 passed
  (`/tmp/expo-usage-server-checks.txt`). Election/judge checks: 2 passed
  (`/tmp/expo-usage-election-checks.txt`). Protocol/history regressions: 16 passed.
- Expo tests: 57 passed. Expo/server type checks and targeted lint passed.
- Android, iOS and web bundle export passed:
  `/tmp/omb-expo-usage-export-LbusJw` (`/tmp/expo-usage-export.txt`).

The screenshots verify React Native Web at phone sizes, not native iOS/Android
runtime or share-sheet interaction. They use synthetic figures, not measured
provider cache rates. The existing companion fixture verifies access control
and CSV transport. The running app and live data were not reloaded or modified.

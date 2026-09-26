import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheStats, usageRange, usageMoney, type UsageRow } from "../src/core/usage.ts";

const row = (values: Partial<UsageRow> = {}): UsageRow => ({ key: "a", label: "A", turns: 2, input: 1000, output: 200,
  cachedInput: 600, costUsd: null, cacheReportedInput: 800, cacheReportedTurns: 1, ...values });
test("cache rate excludes unknown input and reports coverage separately", () => {
  const stats = cacheStats(row());
  assert.equal(stats.rate, 75);
  assert.equal(stats.coverage, 80);
  assert.equal(stats.fresh, 200);
  assert.equal(stats.unknown, 200);
  assert.equal(stats.complete, false);
});
test("missing, legacy, zero-hit and empty cache data remain distinct", () => {
  assert.equal(cacheStats(row({ cachedInput: 0, cacheReportedInput: 0, cacheReportedTurns: 0 })).rate, null);
  const legacy = cacheStats(row({ cacheReportedInput: undefined, cacheReportedTurns: undefined }));
  assert.equal(legacy.rate, null);
  assert.equal(legacy.coverage, null);
  assert.equal(legacy.cached + legacy.fresh + legacy.unknown, 1000);
  assert.equal(cacheStats(row({ cachedInput: 0, cacheReportedInput: 1000, cacheReportedTurns: 2 })).rate, 0);
  assert.equal(cacheStats(row({ input: 0, output: 0, cachedInput: 0, cacheReportedInput: 0, turns: 0 })).rate, null);
});
test("oversized cached values cannot produce a rate above 100 percent", () => {
  assert.equal(cacheStats(row({ cachedInput: 9999 })).rate, 100);
});
test("period presets use inclusive UTC bounds across years and leap days", () => {
  assert.deepEqual(usageRange("lastMonth", new Date("2026-01-03T12:00:00Z")), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(usageRange("lastMonth", new Date("2024-03-01T00:00:00Z")), { from: "2024-02-01", to: "2024-02-29" });
  assert.deepEqual(usageRange("days30", new Date("2026-09-23T00:00:00Z")), { from: "2026-08-25", to: "2026-09-23" });
  assert.equal(usageMoney(null), "Not reported");
  assert.equal(usageMoney(0), "$0.00");
  assert.equal(usageMoney(0.001), "<$0.01");
});

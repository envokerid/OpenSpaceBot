export interface UsageRow {
  key: string;
  label: string;
  turns: number;
  input: number;
  output: number;
  cachedInput: number;
  /** Absent on older servers; never infer reporting coverage from a zero. */
  cacheReportedInput?: number;
  cacheReportedTurns?: number;
  costUsd: number | null;
  unpriced?: number;
  billableUsd?: number | null;
}
export interface UsageSummary {
  groups: UsageRow[];
  total: UsageRow;
  budget?: { spentUsd: number; monthlyUsd: number; percent: number } | null;
  billing?: { currency: string } | null;
}
export type UsagePeriod = "month" | "lastMonth" | "days30";
export type UsageGrouping = "bot" | "model" | "user" | "day" | "engine";
export const usagePeriods = [
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "days30", label: "30 days" },
] as const;
export const usageGroupings = [
  { id: "bot", label: "Bot" }, { id: "model", label: "Model" },
  { id: "engine", label: "Engine" }, { id: "day", label: "Day" },
  { id: "user", label: "Who asked" },
] as const;

const count = (n: number | undefined) => typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
export function cacheStats(row: UsageRow) {
  const input = count(row.input);
  const known = typeof row.cacheReportedInput === "number" && Number.isFinite(row.cacheReportedInput);
  const reported = known ? Math.min(input, count(row.cacheReportedInput)) : 0;
  const cached = Math.min(known ? reported : input, count(row.cachedInput));
  return { input, cached, reported, fresh: reported - (known ? cached : 0), unknown: input - (known ? reported : cached),
    rate: reported > 0 ? cached / reported * 100 : null,
    coverage: input > 0 && known ? reported / input * 100 : null,
    complete: known && reported === input && (row.cacheReportedTurns ?? 0) === row.turns,
  };
}
export const tokenCount = (n: number) => count(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const compactTokens = (n: number) => count(n).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
export const usageMoney = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value)
  ? value > 0 && value < 0.01 ? "<$0.01" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : "Not reported";
export const percent = (value: number | null) => value === null ? "Unknown" : `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
export function usageRange(period: UsagePeriod, now = new Date()) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const start = period === "days30" ? new Date(now.getTime() - 29 * 86400000) : new Date(Date.UTC(y, m - (period === "lastMonth" ? 1 : 0), 1));
  const end = period === "lastMonth" ? new Date(Date.UTC(y, m, 0)) : now;
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
export function usageLabel(row: UsageRow, group: UsageGrouping) {
  if (group !== "user") return row.label;
  if (row.key === "owner") return "This computer";
  if (row.key === "bot") return "Bot to bot";
  return row.label;
}

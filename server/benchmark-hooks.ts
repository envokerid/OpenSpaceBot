// Installed only by the locally launched benchmark preload. No HTTP/config
// surface can enable these hooks; ordinary app processes have no hook object.
export interface BenchmarkHooks {
  prompt(parts: Array<{ id: string; label: string; text: string }>): Array<{ id: string; label: string; text: string }>;
  tool(server: string, name: string, description: string): string | null;
}
const slot = Symbol.for("openmausbot.local-benchmark-hooks");
export function benchmarkHooks(): BenchmarkHooks | undefined {
  return (globalThis as unknown as Record<symbol, BenchmarkHooks | undefined>)[slot];
}

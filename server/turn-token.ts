import { readFileSync } from "node:fs";

/** Capture a turn credential synchronously before a request starts. A missing
 * refresh file means the turn ended, never a fallback to the launch token. */
export function turnToken(env: NodeJS.ProcessEnv, name: string): string {
  const path = env[`${name}_FILE`];
  if (!path) return env[name] ?? "";
  try { return readFileSync(path, "utf8").trim(); } catch { return ""; }
}

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { launchVerificationServer } from "../scripts/control-omb.ts";

it("saves and reports the personal Codex speed setting in an isolated harness", async () => {
  const fixture = await launchVerificationServer(process.env, undefined, undefined, undefined, undefined, undefined, ["codex"]);
  const evidence: unknown[] = [{ fixture: fixture.info }];
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(fixture.info.url + path, {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    const value = await response.json() as any;
    evidence.push({ method, path, status: response.status, value });
    return { status: response.status, value };
  };
  const codex = (result: any) => result.value.instances.find((row: any) => row.instanceId === "codex");
  try {
    expect(codex(await api("GET", "/api/instances")).fastMode).toBe(true);
    const standard = await api("PATCH", "/api/instances/codex", { fastMode: false });
    expect(standard.status).toBe(200);
    expect(codex(standard).fastMode).toBe(false);
    expect(codex(await api("GET", "/api/instances")).fastMode).toBe(false);
    expect(JSON.parse(readFileSync(join(fixture.info.dataDir, "config.json"), "utf8")).instances.codex.config.fastMode).toBe(false);
    expect((await api("PATCH", "/api/instances/claude", { fastMode: false })).status).toBe(400);
    expect((await api("PATCH", "/api/instances/codex", { fastMode: "off" })).status).toBe(400);
    const fast = await api("PATCH", "/api/instances/codex", { fastMode: true });
    expect(fast.status).toBe(200);
    expect(codex(fast).fastMode).toBe(true);
  } finally {
    const path = fixture.info.logPath + ".codex-fast-mode.json";
    writeFileSync(path, JSON.stringify({ evidence }, null, 2));
    await fixture.close();
    console.info(JSON.stringify({ evidencePath: path, fixtureRemoved: !existsSync(fixture.info.dataDir) }));
  }
}, 60_000);

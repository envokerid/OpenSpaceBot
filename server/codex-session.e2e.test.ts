import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";

it("keeps healthy Codex tools ready and rebuilds closed transports across isolated chat turns", async () => {
  const fixture = await launchVerificationServer(process.env, undefined, undefined, undefined, undefined, undefined, ["codex"]);
  const evidence: unknown[] = [{ fixture: fixture.info }];
  const cli = async (...args: string[]) => {
    const result = await runControlOmb([...args, "--url", fixture.info.url]);
    evidence.push({ command: args, result });
    return result as any;
  };
  try {
    const directory = fixture.info.dataDir;
    const dump = join(directory, "codex-runtime.json");
    const plan = join(directory, "codex-plan.json");
    const mcpItem = join(directory, "mcp-item.json");
    const wrapper = join(directory, "codex-fixture.mjs");
    writeFileSync(wrapper, [
      "#!/usr/bin/env node",
      `Object.assign(process.env, ${JSON.stringify({ FAKE_CODEX_MODE: "resume", FAKE_CODEX_DUMP: dump, FAKE_CODEX_ROOM_PLAN: plan, FAKE_CODEX_MCP_ITEM_FILE: mcpItem })});`,
      `await import(${JSON.stringify(new URL("./testing/fake-codex-app-server.ts", import.meta.url).href)});`,
    ].join("\n"), { mode: 0o700 });
    const response = await fetch(fixture.info.url + "/api/instances/codex", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cli: wrapper }),
    });
    expect(response.ok).toBe(true);
    await cli("doctor");
    const { bot } = await cli("new-bot", "--name", "Waiting Codex");
    const catalog = await cli("models");
    const model = catalog.instances.find((instance: any) => instance.instanceId === "codex").models.options[0].id;
    await cli("set-model", "--bot", bot.id, "--instance", "codex", "--model", model);
    writeFileSync(plan, JSON.stringify({ [bot.id]: { turns: [
      { steps: [{ tool: "list_bots", arguments: {} }], reply: "FIRST_WAITING_REPLY" },
      { steps: [{ tool: "list_bots", arguments: {} }], reply: "SECOND_WAITING_REPLY" },
      { steps: [{ tool: "list_bots", arguments: {} }], reply: "CLOSED_TRANSPORT_REPLY" },
      { steps: [{ tool: "list_bots", arguments: {} }], reply: "RECOVERED_TRANSPORT_REPLY" },
    ] } }));
    await cli("send", "--bot", bot.id, "--text", "First request");
    expect((await cli("wait", "--bot", bot.id, "--timeout", "30")).status).toBe("settled");
    const first = JSON.parse(readFileSync(dump, "utf8"));
    expect(existsSync(first.env.OMB_COMMS_TOKEN_FILE)).toBe(false);
    await cli("send", "--bot", bot.id, "--text", "Second request");
    expect((await cli("wait", "--bot", bot.id, "--timeout", "30")).status).toBe("settled");
    const second = JSON.parse(readFileSync(dump, "utf8"));
    expect(second.pid).toBe(first.pid);
    expect(second.calls.filter((call: any) => call.method === "initialize")).toHaveLength(1);
    expect(second.calls.filter((call: any) => call.method === "turn/start")).toHaveLength(2);
    expect(existsSync(second.env.OMB_COMMS_TOKEN_FILE)).toBe(false);
    const transcript = JSON.stringify(await cli("messages", "--bot", bot.id, "--limit", "10"));
    expect(transcript).toContain("FIRST_WAITING_REPLY");
    expect(transcript).toContain("SECOND_WAITING_REPLY");
    const tools = readFileSync(plan + ".evidence.jsonl", "utf8");
    expect(tools).not.toContain('"isError":true');
    evidence.push({ sameProcess: second.pid, initializes: 1, turns: 2, teamToolsSucceeded: true });
    writeFileSync(mcpItem, JSON.stringify({ id: "closed-computer", type: "mcpToolCall", server: "computer", tool: "list_windows",
      status: "failed", error: { message: "tool call failed for computer/list_windows\nCaused by:\n    Transport closed" } }));
    await cli("send", "--bot", bot.id, "--text", "Observe the fixture computer connection");
    expect((await cli("wait", "--bot", bot.id, "--timeout", "30")).status).toBe("settled");
    const failed = JSON.parse(readFileSync(dump, "utf8"));
    expect(failed.pid).toBe(second.pid);
    expect(failed.calls.filter((call: any) => call.method === "turn/start")).toHaveLength(3);
    writeFileSync(mcpItem, JSON.stringify({ id: "fresh-computer", type: "mcpToolCall", server: "computer", tool: "list_windows",
      status: "completed", result: { content: [{ type: "text", text: "fixture desktop" }] } }));
    await cli("send", "--bot", bot.id, "--text", "Try the connection again");
    expect((await cli("wait", "--bot", bot.id, "--timeout", "30")).status).toBe("settled");
    const recovered = JSON.parse(readFileSync(dump, "utf8"));
    expect(recovered.pid).not.toBe(failed.pid);
    expect(recovered.calls.find((call: any) => call.method === "thread/resume")?.params.threadId).toBe("codex-thread-1");
    expect(recovered.calls.filter((call: any) => call.method === "turn/start")).toHaveLength(1);
    expect(existsSync(recovered.env.OMB_COMMS_TOKEN_FILE)).toBe(false);
    const recoveredTranscript = JSON.stringify(await cli("messages", "--bot", bot.id, "--limit", "20"));
    expect(recoveredTranscript).toContain("CLOSED_TRANSPORT_REPLY");
    expect(recoveredTranscript).toContain("RECOVERED_TRANSPORT_REPLY");
    expect(readFileSync(plan + ".evidence.jsonl", "utf8")).not.toContain('"isError":true');
    evidence.push({ replacedProcess: failed.pid, recoveredProcess: recovered.pid, resumedThread: "codex-thread-1", replayedTurns: 0 });
    const deletion = await fetch(fixture.info.url + `/api/bots/${bot.id}`, { method: "DELETE" });
    expect(deletion.ok).toBe(true);
    const deletionResult = await deletion.json();
    await expect.poll(() => {
      try { process.kill(recovered.pid, 0); return true; } catch { return false; }
    }).toBe(false);
    evidence.push({ method: "DELETE", botId: bot.id, result: deletionResult, waitingProcessStopped: true });
  } finally {
    const path = fixture.info.logPath + ".codex-session.json";
    writeFileSync(path, JSON.stringify({ evidence }, null, 2));
    await fixture.close();
    console.info(JSON.stringify({ evidencePath: path, fixtureRemoved: !existsSync(fixture.info.dataDir) }));
  }
}, 90_000);

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";
import { request } from "../scripts/mcp-server.ts";

it("routes ordinary group chat directly to default responders and mentions without private selection turns", async () => {
  const fixture = await launchVerificationServer(process.env, undefined, undefined, undefined, undefined, { scripted: true });
  const actions: unknown[] = [];
  const cli = async (...command: string[]) => {
    const result = await runControlOmb(command, { env: { OPENMAUSBOT_URL: fixture.info.url } }) as any;
    actions.push({ command, result });
    return result;
  };
  const api = (path: string, body: unknown) => request(path, { method: "PATCH", body: JSON.stringify(body) }, fixture.info.url);
  try {
    const alpha = (await cli("new-bot", "--name", "Alpha")).bot;
    const beta = (await cli("new-bot", "--name", "Beta")).bot;
    writeFileSync(join(fixture.info.dataDir, "room-plan.json"), JSON.stringify({
      [alpha.id]: { reply: "Alpha answered directly." },
      [beta.id]: { reply: "Beta answered directly." },
    }));
    const room = (await cli("new-channel", "--name", "Original chat", "--members", `${alpha.id},${beta.id}`)).channel;
    const read = () => cli("messages", "--channel", room.id, "--limit", "100");
    const send = async (text: string) => {
      const before = (await read()).messages.length;
      await cli("send-channel", "--channel", room.id, "--text", text);
      expect((await cli("wait", "--channel", room.id, "--timeout", "30")).status).toBe("settled");
      const messages = (await read()).messages.slice(before);
      expect(messages.some((message: any) => message.goalRun || message.roomVerdict)).toBe(false);
      return messages.filter((message: any) => message.role === "bot" && message.kind === "text").map((message: any) => message.from?.botId);
    };
    await api(`/api/groups/${room.id}`, { defaultResponder: { kind: "member", botId: alpha.id } });
    expect(await send("Hello room")).toEqual([alpha.id]);
    expect(await send("@Beta please reply")).toEqual([beta.id]);
    await api(`/api/groups/${room.id}`, { defaultResponder: { kind: "everyone" } });
    expect(await send("Everyone reply")).toEqual([alpha.id, beta.id]);
    await api(`/api/groups/${room.id}`, { defaultResponder: { kind: "mentions" } });
    expect(await send("A note for later")).toEqual([]);
    expect(await send("@Alpha @Beta please reply")).toEqual([alpha.id, beta.id]);
    const turns = readFileSync(join(fixture.info.dataDir, "room-plan.json.evidence.jsonl"), "utf8")
      .trim().split("\n").map(line => JSON.parse(line).botId);
    expect(turns).toEqual([alpha.id, beta.id, alpha.id, beta.id, alpha.id, beta.id]);
    actions.push({ providerTurnBotIds: turns });
  } finally {
    const evidencePath = `${fixture.info.logPath}.group-chat.json`;
    writeFileSync(evidencePath, JSON.stringify({ fixture: fixture.info, actions }, null, 2));
    console.info(JSON.stringify({ evidencePath, logPath: fixture.info.logPath }));
    await fixture.close();
  }
}, 120_000);

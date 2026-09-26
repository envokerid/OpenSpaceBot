import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";
import { request } from "../scripts/mcp-server.ts";
import { transcriptRows } from "../expo/src/core/transcript.ts";

it("keeps sent and received peer notices in the source transcript with tool details off", async () => {
  const session = await launchVerificationServer(process.env, undefined, undefined, undefined, undefined, { scripted: true });
  const actions: unknown[] = [];
  const cli = async (...args: string[]) => {
    const result = await runControlOmb(args, { env: { OPENMAUSBOT_URL: session.info.url } });
    actions.push({ command: args, result });
    return result as any;
  };
  const api = async (path: string, body?: unknown) => {
    const result = await request(path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }, session.info.url);
    actions.push({ path, body, result });
    return result as any;
  };
  try {
    const source = (await cli("new-bot", "--name", "Sender")).bot;
    const target = (await cli("new-bot", "--name", "Helper")).bot;
    writeFileSync(join(session.info.dataDir, "room-plan.json"), JSON.stringify({
      [source.id]: { steps: [{ tool: "ask_bot", arguments: { bot_id: target.id, message: "Check the deployment" } }], reply: "Checked with Helper" },
    }));
    // Routines retain ask_bot; ordinary direct chat uses coordinate_bots.
    const { routine } = await api("/api/routines", { name: "Peer notice fixture", prompt: "Ask Helper to check the deployment", botId: source.id,
      enabled: false, schedule: { type: "interval", everyMinutes: 60, anchorAt: Date.now() + 3_600_000 } });
    const { run } = await api(`/api/routines/${routine.id}/run`, {});
    let threadId: string | undefined;
    await expect.poll(async () => {
      threadId = (await api("/api/routines")).runs.find((candidate: any) => candidate.id === run.id)?.threadId;
      return threadId;
    }, { timeout: 15_000 }).toBeTruthy();
    expect((await cli("wait", "--bot", source.id, "--task", threadId!, "--timeout", "30")).status).toBe("settled");
    await cli("messages", "--bot", source.id, "--task", threadId!, "--limit", "100");
    const { messages } = await api(`/api/threads/${threadId}/messages`);
    const visible = transcriptRows(messages, "off");
    const sent = visible.find(message => message.tool?.name === "Messaged @Helper");
    const received = visible.find(message => message.tool?.name === "Received message from @Helper");
    expect(sent?.comm?.withBotId).toBe(target.id);
    expect(received?.comm?.groupId).toBe(sent?.comm?.groupId);
    expect(visible.filter(message => message.id === received?.id)).toHaveLength(1);
    expect(received?.text).toBeUndefined();
    const state = await api("/api/bots");
    const channel = state.groups.find((group: any) => group.id === sent?.comm?.groupId);
    expect(channel.messages.some((message: any) => message.from?.botId === target.id && message.text?.includes("Check the deployment"))).toBe(true);
    expect(channel.unread).toBe(false);
  } finally {
    const evidencePath = `${session.info.logPath}.comms-notices.json`;
    writeFileSync(evidencePath, JSON.stringify({ fixture: session.info, actions }, null, 2));
    console.info(JSON.stringify({ evidencePath, logPath: session.info.logPath }));
    await session.close();
  }
}, 60_000);

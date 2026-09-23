import type { RoomBotHistories, RoomBotHistoryTurn } from "./room-bot-history.ts";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderAdapter, SendTurnInput } from "./contracts.ts";
import { SPAWNED_PROXIES } from "./proxy-paths.ts";
import { electionTools } from "./election-tools.ts";
import { parseElectionChoice, parseElectionProposal } from "./room-election.ts";

/** Real provider turns, private from the room. Only validated MCP submissions
 * become decisions; assistant prose never becomes a ballot or a room reply. */
export async function inferRoomElection(input: {
  adapter: ProviderAdapter; botId: string; prompt: string; signal: AbortSignal;
  phase: "proposing" | "judging" | "summary"; candidates: string[];
  selection: Pick<SendTurnInput, "model" | "effort" | "variant">;
  history?: { store: RoomBotHistories; roomThreadId: string; selectionKey: string };
}): Promise<{ text: string; input: number; output: number; cachedInput?: number; costUsd: number | null }> {
  input.signal.throwIfAborted();
  const { phase, candidates } = input;
  const tool = electionTools(phase, candidates)[0];
  const token = randomUUID();
  const threadId = `election-private-${randomUUID()}`;
  const cwd = mkdtempSync(join(tmpdir(), "omb-election-"));
  let submitted: string | undefined;
  let closed = false;
  let history: RoomBotHistoryTurn | undefined;
  let succeeded = false;
  const server = createServer(async (request, response) => {
    const reply = (status: number, body: object) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); };
    if (request.headers.authorization !== `Bearer ${token}`) return reply(403, { error: "Invalid election capability" });
    if (request.method !== "POST" || request.url !== "/decision") return reply(404, { error: "Election submission only" });
    try {
      let body = "";
      for await (const chunk of request) { body += String(chunk); if (body.length > 65536) throw new Error("Submission too large"); }
      if (closed || input.signal.aborted) return reply(410, { error: "Election phase expired" });
      if (submitted !== undefined) return reply(409, { error: "Already submitted" });
      const args = JSON.parse(body);
      if (args.tool !== tool.name) return reply(409, { error: "Wrong election phase" });
      if (phase === "summary") {
        if (typeof args.summary !== "string" || !args.summary.trim() || args.summary.length > 2000) throw new Error("Provide a summary of 1–2000 characters");
        submitted = args.summary.trim();
      } else {
        const choice = phase === "proposing" ? parseElectionProposal(JSON.stringify(args), candidates, input.botId)
          : parseElectionChoice(JSON.stringify(args), candidates, input.botId);
        submitted = JSON.stringify({ candidate: choice.candidate, reason: choice.reason, ...(phase === "proposing" ? { message: choice.message } : {}) });
      }
      reply(200, { accepted: true, instruction: "End this private turn now. Do not post a chat reply." });
    } catch (error) { reply(400, { error: error instanceof Error ? error.message : "Invalid submission" }); }
  });
  let unsubscribe = () => {};
  let abort = () => {};
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Election endpoint unavailable");
    const text = input.prompt + `\n\nSubmit using the ${tool.name} MCP tool instead of returning JSON text. End the turn after it succeeds.`;
    // Separate member proposal journals from legacy voting sessions, which may
    // contain other members' private reasons. Judges retain their full history.
    if (input.history && (phase === "judging" || phase === "proposing")) {
      history = input.history.store.begin(input.history.roomThreadId,
        phase === "proposing" ? `room-proposer-${input.botId}` : input.botId,
        input.history.selectionKey, input.adapter, text);
    }
    return await new Promise((resolve, reject) => {
      abort = () => { closed = true; void input.adapter.interruptTurn(threadId).catch(() => {}); reject(new Error("Election cancelled or timed out")); };
      unsubscribe = input.adapter.onEvent(event => {
        if (event.threadId !== threadId || closed) return;
        try { history?.observe(event); } catch (error) { reject(error); return; }
        if (event.type === "request.opened" && event.requestId) {
          const allowed = event.mcpTool === true && [tool.name, `mcp__agents__${tool.name}`, `agents__${tool.name}`, `agents_${tool.name}`, `agents/${tool.name}`].includes(event.tool);
          void input.adapter.respondToRequest(threadId, event.requestId, { behavior: allowed ? "allow" : "deny", message: "This private phase only submits a room election decision." }).catch(reject);
        } else if (event.type === "turn.completed") {
          closed = true;
          if (!event.ok || submitted === undefined) reject(new Error("Election turn ended without an accepted submission"));
          else { succeeded = true; resolve({ text: submitted, input: event.usage?.input ?? 0, output: event.usage?.output ?? 0,
            ...(typeof event.usage?.cachedInput === "number" ? { cachedInput: event.usage.cachedInput } : {}), costUsd: event.cost ?? null }); }
        } else if (event.type === "runtime.error" && event.terminal) { closed = true; reject(new Error(event.message)); }
      });
      input.signal.addEventListener("abort", abort, { once: true });
      if (input.signal.aborted) { abort(); return; }
      void input.adapter.sendTurn({ threadId, botId: input.botId, ...input.selection, approvalMode: "ask", cwd,
        text, ...history?.input, refreshSystemPrompt: true,
        system: "You are in a private room election phase. Read the supplied conversation. Use only the election submission tool. Compose a ready-made reply from the supplied context when proposing. Do not read project files, run commands, contact bots or post chat messages. All reasons are brief public justifications. The selected draft will be posted verbatim without another working turn.",
        integrations: { agents: { command: process.execPath, args: [SPAWNED_PROXIES.agents], env: {
          ELECTRON_RUN_AS_NODE: "1", OMB_ELECTION_PHASE: phase, OMB_ELECTION_CANDIDATES: JSON.stringify(candidates),
          OMB_HARNESS_URL: `http://127.0.0.1:${address.port}`, OMB_COMMS_TOKEN: token,
        } } },
      }).then(() => {
        if (closed || input.signal.aborted) {
          void input.adapter.interruptTurn(threadId).catch(() => {}).finally(() => input.adapter.releaseSession?.(threadId)).catch(() => {});
        }
      }, reject);
    });
  } finally {
    closed = true;
    input.signal.removeEventListener("abort", abort);
    unsubscribe();
    // Release the transport while retaining this participant's durable cursor.
    try {
      await Promise.race([input.adapter.interruptTurn(threadId).catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]);
      await input.adapter.releaseSession?.(threadId);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(cwd, { recursive: true, force: true });
      history?.finish(succeeded, succeeded ? submitted : undefined);
    }
  }
}

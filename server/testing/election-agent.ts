import { spawn } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { waitForExit } from "./cleanup.ts";

/** Drives the real injected MCP proxy, including its server-side validation. */
export async function runElectionAgent(integration: { command: string; args: string[]; env: Record<string, string> }, prompt: string, argv: string[]) {
  const startedAt = Date.now();
  const control = process.env.FAKE_CLAUDE_ELECTION_CONTROL ? JSON.parse(readFileSync(process.env.FAKE_CLAUDE_ELECTION_CONTROL, "utf8")) : {};
  if (control.delayMs) await new Promise(resolve => setTimeout(resolve, control.delayMs));
  const phase = integration.env.OMB_ELECTION_PHASE;
  if (phase === "judging" && control.judgeDelayMs) await new Promise(resolve => setTimeout(resolve, control.judgeDelayMs));
  const candidates = JSON.parse(integration.env.OMB_ELECTION_CANDIDATES) as string[];
  const conversation = prompt.split("ALL current proposals:")[0].split("Your own proposal history")[0];
  const relevant = control.requestMarker ? conversation.slice(conversation.lastIndexOf(control.requestMarker)) : conversation;
  const replyCount = relevant.split("\n").filter(line => /^[ABC]: Elected reply fixture/.test(line)).length;
  const complete = control.requiredReplies ? replyCount >= control.requiredReplies
    : relevant.includes("Elected reply fixture") || process.env.FAKE_CLAUDE_ELECTION_COMPLETE === "1";
  const members = JSON.parse(prompt.match(/^Members: (\[[^\n]+\])/mu)?.[1] ?? "[]") as Array<{ id: string }>;
  const selected = control.requiredReplies ? members[control.sameSpeaker ? 0 : replyCount]?.id : undefined;
  const self = prompt.match(/You are [^\n]*?\(([^)]+)\)/u)?.[1];
  const candidate = complete && candidates.includes("task_complete") ? "task_complete" : (phase === "proposing" ? self : selected) ?? candidates.find(id => id !== "task_complete") ?? "task_complete";
  const args = phase === "summary" ? { summary: "The user requested an answer; the discussion has not yet supplied one." }
    : control.invalid ? { candidate: "missing", reason: "" }
    : { candidate, reason: phase === "judging" ? "The judge selected the most useful response based on the chat history." : complete ? "The requested response is already in the conversation." : control.uniqueDrafts ? `Private reason from ${self}.` : "This member should supply the missing answer to the user's request." };
  if (phase === "proposing" && !control.invalid) Object.assign(args, { message: complete ? "" : control.uniqueDrafts ? `Elected reply fixture: draft from ${self}.` : "Elected reply fixture: the requested answer is ready." });
  const child = spawn(integration.command, integration.args, { env: { ...process.env, ...integration.env }, stdio: ["pipe", "pipe", "pipe"] });
  let serial = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const lines = createInterface({ input: child.stdout });
  lines.on("line", line => { const value = JSON.parse(line); const waiter = pending.get(value.id); if (waiter) { pending.delete(value.id); waiter.resolve(value); } });
  const fail = (error: Error) => { for (const waiter of pending.values()) waiter.reject(error); pending.clear(); };
  child.on("error", fail);
  child.on("exit", () => fail(new Error("Election proxy exited")));
  child.stderr.resume();
  const call = (method: string, params = {}) => new Promise<any>((resolve, reject) => {
    const id = ++serial; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  try {
    await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "fixture", version: "1" } });
    const listing = await call("tools/list");
    if (listing.result.tools.length !== 1) throw new Error("Election exposed working tools");
    const response = await call("tools/call", { name: listing.result.tools[0].name, arguments: args });
    if (process.env.FAKE_CLAUDE_ELECTION_LOG) appendFileSync(process.env.FAKE_CLAUDE_ELECTION_LOG, JSON.stringify({ startedAt, submittedAt: Date.now(), pid: process.pid, prompt, argv, phase, candidate, tools: listing.result.tools, response }) + "\n");
    if (response.error || response.result?.isError) throw new Error("Fixture submission refused");
  } finally { lines.close(); await waitForExit(child, { signal: "SIGTERM", graceMs: 1000 }); }
}

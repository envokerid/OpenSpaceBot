import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import type { Scenario } from "./schema.ts";
import { redactSecretsInText } from "../../../shared/redact.ts";

export interface ProviderOptions {
  live: boolean; engine: "native" | "openai-compatible"; model: string;
  endpoint?: string; credential?: string; accountId?: string;
}
export interface ProviderRequest { turn: number; body: any; at: number }
export async function startProvider(options: ProviderOptions, evidencePath: string, maxRequests: number, signal: AbortSignal) {
  const requests: ProviderRequest[] = [];
  let turn = -1;
  let script: Scenario["turns"][number]["fake"] = { text: "Benchmark" , calls: [] };
  let scriptedCallsSent = false;
  let failure: string | undefined;
  let requestCount = 0;
  const controllers = new Set<AbortController>();
  const pending = new Set<Promise<void>>();
  const clean = (value: string) => redactSecretsInText(options.credential ? value.replaceAll(options.credential, "[credential redacted]") : value);
  const record = (value: unknown) => appendFileSync(evidencePath, clean(JSON.stringify(value)) + "\n", { mode: 0o600 });
  const server = createServer(async (req, res) => {
    let finished!: () => void;
    const completion = new Promise<void>(resolve => { finished = resolve; });
    pending.add(completion);
    const controller = new AbortController(); controllers.add(controller);
    const disconnect = () => { if (!res.writableFinished) controller.abort(); };
    res.on("close", disconnect);
    try {
      if (req.method === "GET" && req.url?.endsWith("/models")) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ data: [{ id: options.model }], models: [{ slug: options.model }] })); return;
      }
      if (req.method !== "POST" || !["/responses", "/v1/chat/completions"].includes(req.url ?? "")) { res.writeHead(404).end(); return; }
      if (++requestCount > maxRequests) throw new Error("Provider request limit exceeded");
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 8_000_000) throw new Error("Provider request exceeds 8MB"); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (body.model !== options.model) throw new Error("Unexpected model in provider request");
      const id = randomUUID();
      const request = { turn, body: JSON.parse(clean(JSON.stringify(body))), at: Date.now() };
      requests.push(request); record({ phase: "request", id, ...request });
      if (!options.live) {
        const isNative = req.url === "/responses";
        const hasSystem = isNative ? !!body.instructions : body.messages?.some((m: any) => m.role === "system");
        const available = new Set((body.tools ?? []).map((t: any) => t.function?.name ?? t.name));
        const calls = hasSystem && !scriptedCallsSent ? script.calls.filter(c => available.has(c.name)) : [];
        if (hasSystem) scriptedCallsSent = true;
        const reply = hasSystem ? script.text : "Benchmark";
        const payload = isNative ? {
          type: "response.completed", response: { status: "completed", model: options.model,
            output: calls.length ? calls.map(c => ({ type: "function_call", call_id: randomUUID(), name: c.name, arguments: JSON.stringify(c.args) }))
              : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: reply }] }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        } : { model: options.model, choices: [{ message: calls.length ? { role: "assistant", content: null, tool_calls: calls.map(c => ({ id: randomUUID(), type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : { role: "assistant", content: reply }, finish_reason: calls.length ? "tool_calls" : "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
        record({ phase: "response", id, at: Date.now(), body: payload });
        res.setHeader("content-type", isNative ? "text/event-stream" : "application/json");
        res.end(isNative ? `data: ${JSON.stringify(payload)}\n\n` : JSON.stringify(payload)); return;
      }
      const endpoint = options.engine === "native" ? "https://chatgpt.com/backend-api/codex/responses" : `${options.endpoint!.replace(/\/+$/, "")}/chat/completions`;
      const upstream = await fetch(endpoint, {
        method: "POST", redirect: "error", headers: { "content-type": "application/json", accept: "text/event-stream", authorization: `Bearer ${options.credential}`,
          ...(options.engine === "native" ? { originator: "openmausbot" } : {}),
          ...(options.accountId ? { "chatgpt-account-id": options.accountId } : {}) }, body: JSON.stringify(body),
        signal: AbortSignal.any([signal, controller.signal, AbortSignal.timeout(300_000)]),
      });
      record({ phase: "headers", id, at: Date.now(), status: upstream.status });
      if (!upstream.ok) failure = `Provider returned HTTP ${upstream.status}`;
      res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
      const output: Buffer[] = []; let bytes = 0;
      if (upstream.body) for await (const chunk of upstream.body) {
        bytes += chunk.length;
        if (bytes > 8_000_000) { controller.abort(); throw new Error("Provider response exceeds 8MB"); }
        output.push(Buffer.from(chunk)); res.write(chunk);
      }
      record({ phase: "response", id, at: Date.now(), wire: Buffer.concat(output).toString("utf8") });
      res.end();
    } catch (error) {
      failure = clean(error instanceof Error ? error.message : String(error));
      record({ phase: "error", at: Date.now(), message: failure });
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Benchmark provider failed; see provider evidence" }));
    } finally { controllers.delete(controller); res.removeListener("close", disconnect); pending.delete(completion); finished(); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Provider did not bind");
  let closing: Promise<void> | undefined;
  return {
    url: `http://127.0.0.1:${address.port}`, requests,
    get failure() { return failure; },
    setTurn(index: number, fake: typeof script) { turn = index; script = fake; scriptedCallsSent = false; },
    close() {
      if (closing) return closing;
      for (const controller of controllers) controller.abort();
      server.closeAllConnections();
      closing = Promise.all([new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())), ...pending]).then(() => {});
      return closing;
    },
  };
}

import { nativeProvider } from "../../../shared/native-providers.ts";
import { NativeAccounts, credentialHeaders } from "./accounts.ts";
import { ChatProtocolError } from "../openai-chat-protocol.ts";

export function splitNativeModel(value: unknown): { provider: string; model: string } {
  if (typeof value !== "string") throw new Error("Choose a provider model.");
  const colon = value.indexOf(":");
  const provider = value.slice(0, colon); const model = value.slice(colon + 1);
  nativeProvider(provider);
  if (colon < 1 || !model || model.length > 256 || /[\r\n]/.test(model)) throw new Error("Choose a valid provider model.");
  return { provider, model };
}

export function responsesBody(body: any, model: string, provider = "openai-codex"): Record<string, unknown> {
  const input: any[] = []; const instructions: string[] = [];
  for (const message of body.messages ?? []) {
    if (message.role === "system") { instructions.push(message.content ?? ""); continue; }
    if (message.role === "tool") { input.push({ type: "function_call_output", call_id: message.tool_call_id, output: message.content ?? "" }); continue; }
    // Encrypted reasoning is provider-native replay state, never a tool or instruction.
    for (const detail of message.reasoning_details ?? []) if (detail.type === "reasoning" && detail.encrypted_content && detail.openmaus_provider === provider) {
      input.push({ type: "reasoning", encrypted_content: detail.encrypted_content, summary: detail.summary ?? [] });
    }
    if (message.content) input.push({ role: message.role, content: message.content });
    for (const call of message.tool_calls ?? []) input.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments });
  }
  return {
    model, instructions: instructions.join("\n\n"), input, stream: true, store: false,
    include: ["reasoning.encrypted_content"],
    ...(provider === "openai-codex" && body.reasoning?.effort ? { reasoning: { effort: body.reasoning.effort } } : {}),
    ...(provider === "openai-codex" && body.service_tier ? { service_tier: body.service_tier } : {}),
    ...(body.tools?.length ? { tools: body.tools.map((tool: any) => ({ type: "function", ...tool.function, strict: false })) } : {}),
  };
}
export function messagesBody(body: any, model: string): Record<string, unknown> {
  const messages: any[] = []; const system: string[] = [];
  for (const message of body.messages ?? []) {
    if (message.role === "system") { system.push(message.content ?? ""); continue; }
    const role = message.role === "assistant" ? "assistant" : "user";
    const content: any[] = [];
    if (message.role === "tool") content.push({ type: "tool_result", tool_use_id: message.tool_call_id, content: message.content ?? "" });
    else {
      if (message.content) content.push({ type: "text", text: message.content });
      for (const call of message.tool_calls ?? []) content.push({ type: "tool_use", id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) });
    }
    if (!content.length) continue;
    if (messages.at(-1)?.role === role) messages.at(-1).content.push(...content);
    else messages.push({ role, content });
  }
  return {
    model, system: system.join("\n\n"), messages, stream: true, max_tokens: 8192,
    ...(body.tools?.length ? { tools: body.tools.map((tool: any) => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters })) } : {}),
  };
}

async function* events(response: Response): AsyncGenerator<any> {
  if (!response.body) throw new ChatProtocolError("Provider returned no stream.");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let data: string[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 1_048_576) throw new ChatProtocolError("Provider stream frame exceeded the limit.");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, ""); buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        else if (!line && data.length) {
          const raw = data.join("\n"); data = [];
          if (raw !== "[DONE]") { try { yield JSON.parse(raw); } catch { throw new ChatProtocolError("Provider returned an invalid stream frame."); } }
        }
        if (data.join("\n").length > 1_048_576) throw new ChatProtocolError("Provider stream frame exceeded the limit.");
      }
      if (done) { if (buffer.trim() || data.length) throw new ChatProtocolError("Provider stream ended mid-frame."); break; }
    }
  } finally { await reader.cancel().catch(() => {}); }
}
function normalizedResponse(response: Response, protocol: "responses" | "messages", provider: string): Response {
  const encoder = new TextEncoder();
  async function* normalize(): AsyncGenerator<Uint8Array> {
    let complete = false; let sawText = false; let toolIndex = 0;
    const messageTools = new Map<number, { index: number; id: string; name: string; args: string }>();
    let inputTokens = 0; let outputTokens = 0; let stopReason: string | null = null; let messageStarted = false;
    const frame = (delta: any, finish_reason: string | null = null, usage?: any) => encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }], ...(usage ? { usage } : {}) })}\n\n`);
    for await (const event of events(response)) {
      if (event.type === "error" || event.type === "response.failed" || event.type === "response.incomplete") throw new ChatProtocolError("Provider failed or truncated the response.");
      if (protocol === "responses") {
        if (event.type === "response.output_text.delta") { sawText = true; yield frame({ content: event.delta }); }
        else if (event.type === "response.reasoning_summary_text.delta") yield frame({ reasoning_content: event.delta });
        else if (event.type === "response.completed") {
          if (event.response?.status !== "completed" || !Array.isArray(event.response.output)) throw new ChatProtocolError("Provider did not complete the response.");
          let index = 0;
          for (const item of event.response.output) {
            if (item.type === "function_call") yield frame({ tool_calls: [{ index: index++, id: item.call_id, type: "function", function: { name: item.name, arguments: item.arguments } }] });
            if (item.type === "reasoning" && item.encrypted_content) yield frame({ reasoning_details: [{ type: "reasoning", encrypted_content: item.encrypted_content, openmaus_provider: provider, summary: item.summary ?? [] }] });
            if (item.type === "message" && !sawText) for (const part of item.content ?? []) if (part.type === "output_text") yield frame({ content: part.text });
          }
          yield frame({}, index ? "tool_calls" : "stop", { prompt_tokens: event.response.usage?.input_tokens ?? 0, completion_tokens: event.response.usage?.output_tokens ?? 0 });
          complete = true; break;
        }
      } else {
        if (event.type === "message_start") { messageStarted = true; inputTokens = event.message?.usage?.input_tokens ?? 0; }
        if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
          if (messageTools.has(event.index) || toolIndex >= 128) throw new ChatProtocolError("Provider returned invalid tool blocks.");
          const initial = event.content_block.input;
          messageTools.set(event.index, { index: toolIndex++, id: event.content_block.id, name: event.content_block.name, args: initial && Object.keys(initial).length ? JSON.stringify(initial) : "" });
        }
        if (event.type === "content_block_delta") {
          if (event.delta?.type === "text_delta") yield frame({ content: event.delta.text });
          if (event.delta?.type === "thinking_delta") yield frame({ reasoning_content: event.delta.thinking });
          if (event.delta?.type === "input_json_delta") {
            const tool = messageTools.get(event.index); if (!tool) throw new ChatProtocolError("Provider returned unbound tool arguments.");
            tool.args += event.delta.partial_json;
            if (tool.args.length > 256_000) throw new ChatProtocolError("Provider tool arguments exceeded the limit.");
          }
        }
        if (event.type === "content_block_stop" && messageTools.has(event.index)) {
          const tool = messageTools.get(event.index)!;
          messageTools.delete(event.index);
          yield frame({ tool_calls: [{ index: tool.index, id: tool.id, type: "function", function: { name: tool.name, arguments: tool.args || "{}" } }] });
        }
        if (event.type === "message_delta") {
          stopReason = event.delta?.stop_reason === "tool_use" ? "tool_calls" : event.delta?.stop_reason === "end_turn" ? "stop" : event.delta?.stop_reason ?? stopReason;
          outputTokens = event.usage?.output_tokens ?? outputTokens;
        }
        if (event.type === "message_stop") { if (!messageStarted || !stopReason || messageTools.size) throw new ChatProtocolError("Provider ended with incomplete message or tool calls."); yield frame({}, stopReason, { prompt_tokens: inputTokens, completion_tokens: outputTokens }); complete = true; break; }
      }
      // Keep the common runtime's idle timer alive during upstream tool deltas.
      yield encoder.encode(": provider event\n\n");
    }
    if (!complete) throw new ChatProtocolError("Provider stream ended before completion.");
    yield encoder.encode("data: [DONE]\n\n");
  }
  const iterator = normalize();
  return new Response(new ReadableStream({
    async pull(controller) { try { const next = await iterator.next(); if (next.done) controller.close(); else controller.enqueue(next.value); } catch (error) { controller.error(error); } },
    async cancel() { await iterator.return(undefined); },
  }), { headers: { "content-type": "text/event-stream" } });
}

export async function nativeCompletion(accounts: NativeAccounts, body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  const { provider: id, model } = splitNativeModel(body.model); const provider = nativeProvider(id);
  const credential = await accounts.credential(id, signal);
  const endpoint = credential.baseUrl ?? provider.baseUrl;
  const payload = provider.protocol === "responses" ? responsesBody(body, model, id)
    : provider.protocol === "messages" ? messagesBody(body, model) : { ...body, model };
  // Opaque reasoning replay is scoped to the provider that generated it.
  if (provider.protocol === "chat") payload.messages = (body.messages as any[]).map(({ reasoning_details, ...message }) => ({ ...message, ...(id === "openrouter" && reasoning_details ? { reasoning_details: reasoning_details.filter((d: any) => d.type !== "reasoning") } : {}) }));
  const response = await accounts.fetch(`${endpoint}/${provider.protocol === "responses" ? "responses" : provider.protocol === "messages" ? "messages" : "chat/completions"}`, {
    method: "POST", redirect: "error", signal,
    headers: { ...credentialHeaders(provider, credential), "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return new Response("Provider request failed.", { status: response.status });
  }
  if (provider.protocol === "chat") return response;
  // Both native protocols always stream, including tool-free helpers. The common
  // runtime can consume a streaming response regardless of the caller's hint.
  return normalizedResponse(response, provider.protocol, id);
}

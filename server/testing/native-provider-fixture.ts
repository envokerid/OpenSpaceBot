// Deterministic provider wire protocols. No network, CLI, or real credentials.
export const FIXTURE_KEY = "native-fixture-private-key";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (events: unknown[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
export const fixtureJwt = (seconds = 3600) => `fixture.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds, scope: "inference:invoke", "https://api.openai.com/auth": { chatgpt_account_id: "fixture-account" } })).toString("base64url")}.signature`;
export function nativeProviderFixture() {
  const calls: Array<{ url: string; headers: Headers; body: any }> = [];
  const state = { approved: true, tool: false, truncated: false, denial: false, refreshCount: 0, pollCount: 0 };
  const fetcher: typeof fetch = async (input, init) => {
    init?.signal?.throwIfAborted();
    const url = new URL(String(input));
    const raw = init?.body?.toString();
    const headers = new Headers(init?.headers);
    const body = !raw ? {} : headers.get("content-type")?.includes("json") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    calls.push({ url: url.href, headers, body });
    if (url.pathname.endsWith("openid-configuration")) return json({ token_endpoint: "https://auth.x.ai/oauth2/token" });
    if (url.pathname.endsWith("usercode")) return json({ device_auth_id: "private-device", user_code: "TEST-12345", interval: 1 });
    if (url.pathname.endsWith("device/code")) return json({ device_code: "private-device", user_code: "ABCD-EFGH", verification_uri: url.origin + "/device", expires_in: 600, interval: 1 });
    if (url.pathname.endsWith("auth/keys")) return json({ key: FIXTURE_KEY });
    if (url.pathname.endsWith("/token")) {
      if (body.grant_type === "refresh_token") state.refreshCount++;
      else { state.pollCount++; if (!state.approved) return json({ error: "authorization_pending" }, url.hostname === "auth.openai.com" ? 403 : 400); }
      if (url.pathname.includes("deviceauth")) return json({ authorization_code: "fixture-code", code_verifier: "fixture-verifier" });
      return json({ access_token: fixtureJwt(), refresh_token: "fixture-refresh-secret", expires_in: 3600, scope: "inference:invoke" });
    }
    if (url.pathname.endsWith("models")) {
      if (headers.get("authorization") === "Bearer invalid" || headers.get("x-api-key") === "invalid") return json({}, 401);
      return json({ data: [{ id: "fixture-model", name: "Fixture model" }], models: [{ slug: "fixture-model", display_name: "Fixture model" }] });
    }
    if (url.pathname.endsWith("responses")) {
      const result = (body.input ?? []).find((item: any) => item.type === "function_call_output");
      const tool = body.tools?.find((tool: any) => tool.name.includes("fixture") && tool.name.includes("write"));
      const output = state.tool && !result && tool
        ? [{ type: "function_call", call_id: "call-fixture", name: tool.name, arguments: '{"value":"native-tool-proof"}' }]
        : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: result ? "Native tool completed." : "Native fixture reply." }] }];
      return sse(state.truncated ? [{ type: "response.output_text.delta", delta: "unfinished" }] : [{ type: "response.completed", response: { status: "completed", output, usage: { input_tokens: 10, output_tokens: 3 } } }]);
    }
    if (url.pathname.endsWith("messages")) {
      const result = body.messages?.some((message: any) => message.content.some((part: any) => part.type === "tool_result"));
      const tool = body.tools?.find((tool: any) => tool.name.includes("fixture") && tool.name.includes("write"));
      const toolRound = state.tool && !result && tool;
      return sse([
        { type: "message_start", message: { usage: { input_tokens: 11 } } },
        { type: "content_block_start", index: 0, content_block: toolRound ? { type: "tool_use", id: "call-fixture", name: tool.name, input: {} } : { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: toolRound ? { type: "input_json_delta", partial_json: '{"value":"native-tool-proof"}' } : { type: "text_delta", text: result ? "Native tool completed." : "Native fixture reply." } },
        { type: "content_block_stop", index: 0 },
        ...state.truncated ? [] : [{ type: "message_delta", delta: { stop_reason: toolRound ? "tool_use" : "end_turn" }, usage: { output_tokens: 3 } }, { type: "message_stop" }],
      ]);
    }
    if (url.pathname.endsWith("chat/completions")) {
      const result = body.messages?.find((message: any) => message.role === "tool");
      const tool = body.tools?.find((tool: any) => tool.function.name.includes("fixture") && tool.function.name.includes("write"));
      const toolRound = state.tool && !result && tool;
      return json({ choices: [{ message: toolRound ? { content: null, tool_calls: [{ id: "call-fixture", type: "function", function: { name: tool.function.name, arguments: '{"value":"native-tool-proof"}' } }] } : { content: result ? "Native tool completed." : "Native fixture reply." }, finish_reason: toolRound ? "tool_calls" : "stop" }], usage: { prompt_tokens: 10, completion_tokens: 3 } });
    }
    throw new Error(`Unexpected fixture endpoint: ${url.origin}${url.pathname}`);
  };
  return { calls, state, fetch: fetcher };
}

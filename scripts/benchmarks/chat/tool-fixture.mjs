// Declarative MCP fixture: tools can only return scenario data and advance
// counters in the disposable directory. No shell, network, or arbitrary writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const file = process.env.CHAT_BENCH_TOOLS;
if (!file) throw new Error('Missing owned fixture definition');
const tools = JSON.parse(readFileSync(file, 'utf8'));
const stateFile = file + '.state.json';
let counts = {};
try { counts = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  let result;
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'chat-benchmark', version: '1' } };
  else if (request.method === 'tools/list') result = { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
  else if (request.method === 'tools/call') {
    const tool = tools.find(t => t.name === request.params.name);
    if (!tool) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32602, message: 'Unknown fixture tool' } }) + '\n'); return; }
    const count = counts[tool.name] ?? 0;
    const response = tool.responses[Math.min(count, tool.responses.length - 1)];
    counts[tool.name] = count + 1;
    writeFileSync(stateFile, JSON.stringify(counts), { mode: 0o600 });
    result = { content: [{ type: 'text', text: response.text }], isError: response.isError };
  } else result = {};
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});

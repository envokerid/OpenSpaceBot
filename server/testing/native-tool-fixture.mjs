// The only side effect is an artifact in the caller's disposable directory.
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const artifact = process.env.NATIVE_FIXTURE_ARTIFACT;
if (!artifact) throw new Error('Explicit fixture artifact required');
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (!request.id) return;
  let result;
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
  else if (request.method === 'tools/list') result = { tools: [{ name: 'write', description: 'Write a fixture artifact', inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false } }] };
  else if (request.method === 'tools/call') { writeFileSync(artifact, request.params.arguments.value); result = { content: [{ type: 'text', text: 'Artifact written.' }] }; }
  else result = {};
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});

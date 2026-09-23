// Only ever mutates the isolated fake-engine fixture launched here.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { launchVerificationServer, runControlOmb } from '../../scripts/control-omb.ts';
import { Client, pair } from '../src/core/client.ts';
import { parseInvite } from '../src/core/pairing.ts';
import { Session } from '../src/core/session.ts';
import { composerPayload } from '../src/core/goalComposer.ts';

const fixture = await launchVerificationServer({ ...process.env, FAKE_CLAUDE_REPLIES: JSON.stringify([
  'The draft is ready.\n<openmaus-goal>{"status":"completed","detail":"Draft written and checked."}</openmaus-goal>',
]) });
process.env.OMB_COMPANION_DIR = join(fixture.info.dataDir, 'expo-goal-companion');
const { DeviceRegistry } = await import('../../companion/src/devices.ts');
const { createProxyHandler } = await import('../../companion/src/proxy.ts');
const registry = new DeviceRegistry();
const sidecar = createServer(createProxyHandler({ harnessPort: Number(new URL(fixture.info.url).port), authenticate: value => registry.authenticate(value), redeem: (code, name, requestId) => registry.redeem(code, name, requestId), serverName: () => 'Goal fixture' }));
const evidence: unknown[] = [{ fixture: fixture.info }];
let session: Session | undefined;
try {
  sidecar.listen(0, '127.0.0.1'); await once(sidecar, 'listening');
  const address = sidecar.address(); assert.ok(address && typeof address !== 'string');
  const window = registry.openPairing();
  const paired = await pair(parseInvite(`openmausbot://pair?address=${encodeURIComponent(`http://127.0.0.1:${address.port}`)}&token=${window.token}`), 'Goal verification', randomUUID());
  const client = new Client(paired.connection, paired.token);
  const created = await runControlOmb(['new-bot', '--name', 'Goal lead', '--url', fixture.info.url]) as { bot: { id: string } };
  const { group } = await client.createGroup('Expo goal fixture', [created.bot.id]);
  const destination = { kind: 'groups' as const, id: group.id, threadId: group.threadId };
  session = new Session(client); session.start(); await session.load(group.threadId);
  const sendId = randomUUID();
  const payload = composerPayload('/goal Prepare a checked draft', true);
  await client.send(destination, payload.text, sendId, payload.mode);
  const deadline = Date.now() + 30_000;
  let page = await client.page(group.threadId);
  while (!page.messages.some(message => message.goalRun?.status === 'completed')) {
    assert.ok(Date.now() < deadline, 'Goal must reach completed');
    await new Promise(resolve => setTimeout(resolve, 100));
    page = await client.page(group.threadId);
  }
  assert.equal(page.messages.find(message => message.sendId === sendId)?.channelMode, 'goal');
  const run = page.messages.find(message => message.goalRun)?.goalRun;
  assert.equal(run?.goal, 'Prepare a checked draft');
  assert.equal(run?.detail, 'Draft written and checked.');
  await client.send(destination, 'Prepare a checked draft', sendId, 'goal');
  const repeated = await client.page(group.threadId);
  assert.equal(repeated.messages.filter(message => message.sendId === sendId).length, 1);
  assert.equal(repeated.messages.filter(message => message.goalRun).length, 1);
  while (!session.state.pages[group.threadId]?.messages.some(message => message.goalRun?.status === 'completed')) {
    assert.ok(Date.now() < deadline, 'Completed goal must reach Expo through SSE');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const chatId = randomUUID();
  await client.send(destination, 'Thanks', chatId);
  assert.notEqual((await client.page(group.threadId)).messages.find(message => message.sendId === chatId)?.channelMode, 'goal');
  evidence.push({ status: 'passed', checks: ['paired companion goal send', 'durable goal prompt', 'completed goal card', 'SSE status update', 'idempotent retry', 'normal chat after goal'], run, transcript: repeated.messages });
  console.log(JSON.stringify({ status: 'passed', evidencePath: `${fixture.info.logPath}.expo-goals.json` }));
} finally {
  session?.stop(); sidecar.closeAllConnections(); await new Promise<void>(resolve => sidecar.close(() => resolve()));
  writeFileSync(`${fixture.info.logPath}.expo-goals.json`, JSON.stringify(evidence, null, 2));
  await fixture.close();
}

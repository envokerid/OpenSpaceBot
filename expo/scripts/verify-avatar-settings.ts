// Headless protocol verification only. Owns every server, credential and image.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { launchVerificationServer, runControlOmb } from '../../scripts/control-omb.ts';
import { avatarEditorFor } from '../src/core/avatarEditor.ts';
import { Session } from '../src/core/session.ts';
import { Client, pair } from '../src/core/client.ts';
import { parseInvite } from '../src/core/pairing.ts';
import { generateAvatar, imageConnectionPatch, imageKeyRemoval, RESET_MASCOT, saveAvatar, uploadedAvatar } from '../src/core/avatarSettings.ts';
import { MAUS_COLOR_NAMES, PICKABLE_STATES } from '../../shared/mascot-appearance.ts';
import { MASCOT_BODY_IDS } from '../../shared/mascot-bodies.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const fixture = await launchVerificationServer();
process.env.OMB_COMPANION_DIR = join(fixture.info.dataDir, 'avatar-companion');
const { DeviceRegistry } = await import('../../companion/src/devices.ts');
const { createProxyHandler } = await import('../../companion/src/proxy.ts');
const registry = new DeviceRegistry();
const sidecar = createServer(createProxyHandler({ harnessPort: Number(new URL(fixture.info.url).port), authenticate: token => registry.authenticate(token), redeem: (code, name, id) => registry.redeem(code, name, id), serverName: () => 'Avatar fixture' }));
const requests: { prompt: string; authorization?: string }[] = [];
const provider = createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString());
  requests.push({ prompt: body.prompt, authorization: req.headers.authorization });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
});
const evidence: unknown[] = [{ fixture: fixture.info }];
let session: Session | undefined;
const waitUntil = async (condition: () => boolean) => {
  const deadline = Date.now() + 20_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for avatar stream update');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
};
try {
  sidecar.listen(0, '127.0.0.1'); await once(sidecar, 'listening');
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  const address = sidecar.address(); const imageAddress = provider.address();
  assert.ok(address && typeof address !== 'string' && imageAddress && typeof imageAddress !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const window = registry.openPairing();
  const paired = await pair(parseInvite(`openmausbot://pair?address=${encodeURIComponent(origin)}&token=${window.token}`), 'Avatar verification', randomUUID());
  const client = new Client(paired.connection, paired.token);
  const created = await runControlOmb(['new-bot', '--name', 'Avatar Probe', '--url', fixture.info.url]) as { bot: { id: string } };
  const id = created.bot.id;
  for (const color of MAUS_COLOR_NAMES) assert.equal((await saveAvatar(client, id, { color })).color, color);
  for (const mascotExpression of PICKABLE_STATES) assert.equal((await saveAvatar(client, id, { mascotExpression })).mascotExpression, mascotExpression);
  for (const mascotBody of MASCOT_BODY_IDS) assert.equal((await saveAvatar(client, id, { mascotBody })).mascotBody, mascotBody);
  for (const patch of [{ color: 'invisible' }, { mascotExpression: 'constructor' }, { autoApprove: true }]) {
    await assert.rejects(client.request(`/api/bots/${id}/profile`, 'PATCH', patch));
  }
  const saved = await client.upload(png, 'avatar.png', 'image/png', randomUUID());
  let bot = await saveAvatar(client, id, uploadedAvatar(saved.path, 'mascot'));
  assert.equal(bot.avatarCrop, 'circle'); assert.ok(bot.avatarUrl);
  assert.deepEqual(Buffer.from(await (await client.response(bot.avatarUrl)).arrayBuffer()), png);
  for (const avatarCrop of ['circle', 'rounded', 'square', 'mascot'] as const) assert.equal((await saveAvatar(client, id, { avatarCrop })).avatarCrop, avatarCrop);
  bot = await saveAvatar(client, id, RESET_MASCOT);
  assert.equal(bot.color, 'green'); assert.equal(bot.mascotExpression, null); assert.equal(bot.mascotBody, 'cursor'); assert.ok(bot.avatarUrl);
  bot = await saveAvatar(client, id, { avatarUrl: null, avatarCrop: 'mascot' });
  assert.ok(!bot.avatarUrl);
  evidence.push({ action: 'All colors, expressions, bodies, crops, upload, authenticated image read, reset and removal', passed: true, colors: MAUS_COLOR_NAMES, expressions: PICKABLE_STATES, bodies: MASCOT_BODY_IDS, reset: { color: bot.color, mascotExpression: bot.mascotExpression, mascotBody: bot.mascotBody, avatarCrop: bot.avatarCrop, avatarUrl: bot.avatarUrl } });
  const connection = imageConnectionPatch('custom', `http://127.0.0.1:${imageAddress.port}/v1`, 'fixture-image', 'fixture-image-key');
  await assert.rejects(client.request('/api/config', 'PATCH', connection), /settings access is off/i);
  registry.setSettingsAccess(registry.authenticate(paired.token)!.id, true);
  const config = await client.request('/api/config', 'PATCH', connection);
  assert.ok(!JSON.stringify(config).includes('fixture-image-key'));
  const identity = { name: 'Phone Artist', title: 'Painter', description: 'Paints tiny landscapes' };
  bot = await generateAvatar(client, id, '', identity);
  assert.equal(bot.avatarCrop, 'circle'); assert.ok(bot.avatarUrl);
  assert.ok(requests[0].prompt.includes(identity.name)); assert.ok(requests[0].prompt.includes(identity.description));
  assert.equal(requests[0].authorization, 'Bearer fixture-image-key');
  await saveAvatar(client, id, { avatarCrop: 'square' });
  await client.request('/api/config', 'PATCH', imageKeyRemoval('custom'));
  bot = await generateAvatar(client, id, 'a blue owl', identity);
  assert.equal(bot.avatarCrop, 'square'); assert.ok(requests[1].prompt.includes('a blue owl')); assert.equal(requests[1].authorization, undefined);
  const persisted = (await client.fleet()).bots.find(b => b.id === id)!;
  assert.equal(persisted.avatarUrl, bot.avatarUrl); assert.equal(persisted.avatarCrop, 'square');
  evidence.push({ action: 'Provider permission, custom connection, redacted key, identity-aware empty prompt, returned crop, key removal and keyless generation', passed: true, resultingProfile: { name: persisted.name, avatarUrl: persisted.avatarUrl, avatarCrop: persisted.avatarCrop }, generatedRequests: requests.length });
  session = new Session(client);
  session.start();
  await waitUntil(() => session!.state.status === 'connected' && session!.state.hydrated);
  let saves = 0, fleetReads = 0;
  const fetcher = client.fetcher;
  client.fetcher = async (url, init) => {
    if (String(url).includes('/api/bots?')) fleetReads++;
    if (String(url).endsWith(`/api/bots/${id}/profile`) && init?.method === 'PATCH') saves++;
    return fetcher(url, init);
  };
  const editor = avatarEditorFor(session, persisted);
  const unsubscribe = session.subscribe(() => {
    const next = session!.state.bots.find(bot => bot.id === id);
    if (next) editor.receive(next);
  });
  try {
    for (let i = 0; i < 60; i++) {
      const color = i % 2 ? 'blue' : 'red';
      editor.edit({ color });
      assert.equal(editor.snapshot().appearance.color, color);
    }
    editor.edit({ mascotBody: 'star', mascotExpression: 'happy', avatarCrop: 'mascot' });
    assert.equal(saves, 0);
    await editor.flush();
    await waitUntil(() => {
      const next = session!.state.bots.find(bot => bot.id === id);
      return next?.color === 'blue' && next.mascotBody === 'star' && next.mascotExpression === 'happy' && next.avatarCrop === 'mascot';
    });
    assert.equal(saves, 1);
    assert.equal(fleetReads, 0);
    assert.equal(editor.snapshot().pending, false);
    evidence.push({ action: '60 rapid color taps and final body/expression/crop edits preview immediately and save in one ordered request; the confirmed save updates the workspace without a fleet reload', passed: true, saves, fleetReads, resultingAppearance: editor.snapshot().appearance });
  } finally { unsubscribe(); }
  // Native SSE may be paused/buffered. Exercise the production editor binding
  // without starting an event stream, then independently check durable state.
  const withoutStream = new Session(client);
  await withoutStream.refresh();
  const oldBot = withoutStream.state.bots.find(bot => bot.id === id)!;
  const localEditor = avatarEditorFor(withoutStream, oldBot);
  const readsBefore = fleetReads;
  localEditor.edit({ mascotBody: 'diamond', color: 'purple', mascotExpression: 'curious' });
  await localEditor.flush();
  const displayed = withoutStream.state.bots.find(bot => bot.id === id)!;
  assert.equal(displayed.mascotBody, 'diamond');
  assert.equal(displayed.color, 'purple');
  assert.equal(displayed.mascotExpression, 'curious');
  assert.equal(fleetReads, readsBefore, 'save must update local state without a fleet read');
  const durable = (await client.fleet()).bots.find(bot => bot.id === id)!;
  assert.equal(durable.mascotBody, displayed.mascotBody);
  assert.equal(durable.color, displayed.color);
  assert.equal(durable.mascotExpression, displayed.mascotExpression);
  evidence.push({ action: 'Production editor updates the shared bot with no event stream and no refresh; independent API read confirms persistence', passed: true, resultingAppearance: localEditor.snapshot().appearance });
  console.log(JSON.stringify({ status: 'passed', evidencePath: `${fixture.info.logPath}.expo-avatars.json` }));
} finally {
  session?.stop();
  sidecar.closeAllConnections(); provider.closeAllConnections();
  await Promise.all([new Promise<void>(resolve => sidecar.close(() => resolve())), new Promise<void>(resolve => provider.close(() => resolve()))]);
  writeFileSync(`${fixture.info.logPath}.expo-avatars.json`, JSON.stringify(evidence, null, 2));
  await fixture.close();
}

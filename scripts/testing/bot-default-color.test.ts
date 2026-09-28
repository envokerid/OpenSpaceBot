import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { launchVerificationServer, runControlOmb } from '../control-omb.ts';
import { request } from '../mcp-server.ts';

it('creates white bots through the shared API without recoloring existing bots', async () => {
  const session = await launchVerificationServer(process.env);
  const evidence: unknown[] = [{ fixture: session.info }];
  const create = async (name: string) => {
    const command = ['new-bot', '--name', name, '--url', session.info.url];
    const result = await runControlOmb(command) as { bot: { id: string } };
    evidence.push({ command, result });
    return result.bot.id;
  };
  try {
    const first = await create('White default fixture');
    const snapshot = async () => {
      const result = await request('/api/bots?messages=0', {}, session.info.url) as { bots: Array<{ id: string; color: string }> };
      const colors = result.bots.map(({ id, color }) => ({ id, color }));
      evidence.push({ action: 'GET /api/bots?messages=0', colors });
      return colors;
    };
    expect((await snapshot()).find(bot => bot.id === first)?.color).toBe('white');
    const patch = { color: 'purple' };
    await request(`/api/bots/${first}`, { method: 'PATCH', body: JSON.stringify(patch) }, session.info.url);
    evidence.push({ action: `PATCH /api/bots/${first}`, patch });
    const second = await create('Another white default fixture');
    const colors = await snapshot();
    expect(colors.find(bot => bot.id === first)?.color).toBe('purple');
    expect(colors.find(bot => bot.id === second)?.color).toBe('white');
  } finally {
    const evidencePath = `${session.info.logPath}.bot-default-color.json`;
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.info(JSON.stringify({ evidencePath, logPath: session.info.logPath }));
    await session.close();
  }
}, 60_000);

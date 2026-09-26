import { botAvatarUrlFromStoredPath, type BotAvatarCrop } from '../../../shared/bot-avatar.ts';
import { normalizeImageGenerationUrl, type AvatarImageProvider } from '../../../shared/image-generation.ts';
import type { Bot } from './types.ts';
import { routeId, type Client } from './client.ts';

export type AvatarPatch = Partial<Pick<Bot, 'avatarUrl' | 'avatarCrop' | 'color' | 'mascotExpression' | 'mascotBody'>>;
export const RESET_MASCOT: AvatarPatch = { avatarCrop: 'mascot', color: 'green', mascotExpression: null, mascotBody: 'cursor' };
export function uploadedAvatar(path: string, crop: BotAvatarCrop): AvatarPatch {
  const avatarUrl = botAvatarUrlFromStoredPath(path);
  if (!avatarUrl) throw new Error('Choose a PNG, JPEG, GIF, or WebP image.');
  return { avatarUrl, avatarCrop: crop === 'mascot' ? 'circle' : crop };
}
export function imageConnectionPatch(provider: AvatarImageProvider, url: string, model: string, key: string) {
  const imageGen: Record<string, string> = { provider };
  if (provider === 'custom') {
    imageGen.customUrl = normalizeImageGenerationUrl(url.trim());
    const id = model.trim();
    if (!id || id.length > 200 || /[\r\n\0]/.test(id)) throw new Error('Use a model ID of at most 200 characters without control characters.');
    imageGen.customModel = id;
  }
  const secret = key.trim();
  if (secret && provider !== 'xai') imageGen[provider === 'custom' ? 'customApiKey' : 'key'] = secret;
  return { imageGen, ...(secret && provider === 'xai' ? { xai: { key: secret } } : {}) };
}
export function imageKeyRemoval(provider: AvatarImageProvider) {
  return provider === 'xai' ? { xai: { key: '' } } : { imageGen: { [provider === 'custom' ? 'customApiKey' : 'key']: '' } };
}
export async function saveAvatar(client: Client, botId: string, patch: AvatarPatch) {
  return (await client.request<{ bot: Bot }>(`/api/bots/${routeId(botId)}/profile`, 'PATCH', patch)).bot;
}
export async function generateAvatar(client: Client, botId: string, prompt: string, identity: { name: string; title: string; description: string }) {
  // The generator builds its prompt from the saved identity, like desktop.
  await client.request(`/api/bots/${routeId(botId)}/profile`, 'PATCH', identity);
  return (await client.request<{ bot: Bot }>(`/api/bots/${routeId(botId)}/avatar/generate`, 'POST', { prompt: prompt.trim() }, 150_000)).bot;
}

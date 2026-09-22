import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { randomUUID } from 'expo-crypto';
import type { Client } from './core/client';
import type { Upload } from './core/types';

export const escapeAttribute = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
export function attachedText(text: string, files: Upload[]) {
  return [text.trim(), ...files.map(f => `<attached-${f.kind ?? 'file'} path="${escapeAttribute(f.path)}" name="${escapeAttribute(f.name)}" />`)].filter(Boolean).join('\n\n');
}
export async function uploadFile(client: Client, uri: string, name: string, mime: string, uploadId = randomUUID()): Promise<Upload> {
  const file = new File(uri);
  const image = /^image\/(png|jpeg|gif|webp)$/.test(mime);
  if (file.size > (image ? 10 : 25) * 1024 * 1024) throw new Error(`Choose a file under ${image ? 10 : 25} MB.`);
  const saved = await client.upload(await file.bytes(), name, mime, uploadId);
  return { ...saved, name: saved.name || name, kind: image ? 'image' : 'file' };
}
export async function shareResponse(response: Response, name: string) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 25 * 1024 * 1024) throw new Error('This file is larger than 25 MB.');
  const safeName = name.split(/[\\/]/).pop()!.replace(/[^\w. -]/g, '_').slice(-100) || 'download';
  const file = new File(Paths.cache, `${randomUUID()}-${safeName}`);
  try {
    file.write(bytes);
    if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(file.uri);
  } finally { if (file.exists) file.delete(); }
}

export async function openResponse(response: Response, name: string) {
  const { Platform } = await import('react-native');
  if (Platform.OS !== 'android') return shareResponse(response,name);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 25*1024*1024) throw new Error('This file is larger than 25 MB.');
  const safeName = name.split(/[\\/]/).pop()!.replace(/[^\w. -]/g,'_').slice(-100) || 'download';
  const file = new File(Paths.cache, `${randomUUID()}-${safeName}`); file.write(bytes);
  const { getContentUriAsync } = await import('expo-file-system/legacy');
  const { startActivityAsync } = await import('expo-intent-launcher');
  await startActivityAsync('android.intent.action.VIEW', { data: await getContentUriAsync(file.uri), flags: 1, type: response.headers.get('content-type') ?? 'application/octet-stream' });
  // The external viewer reads asynchronously. Android owns cache eviction.
}

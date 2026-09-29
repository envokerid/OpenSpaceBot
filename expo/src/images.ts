import { useEffect, useState } from 'react';
import type { Client } from './core/client';

// Fetch authenticated image bytes ourselves so redirects can never forward a
// device token. Native Image only receives the resulting local data URI.
export function useAuthenticatedImage(client: Client, path?: string, retry = 0) {
  const [image, setImage] = useState<{ path?: string; uri?: string; failed?: boolean }>({});
  useEffect(() => {
    if (!path) return;
    setImage({ path });
    let alive = true; const controller = new AbortController();
    void (async () => {
      client.imageSource(path);
      const response = await client.response(path, { signal: controller.signal });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 25 * 1024 * 1024) throw new Error('Image too large');
      const mime = response.headers.get('content-type')?.split(';')[0];
      if (!mime || !/^image\/(png|jpeg|gif|webp)$/.test(mime)) throw new Error('Unsupported image');
      let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      if (alive) setImage({ path, uri: `data:${mime};base64,${btoa(binary)}` });
    })().catch(() => { if (alive) setImage({ path, failed: true }); });
    return () => { alive = false; controller.abort(); };
  }, [client, path, retry]);
  return image.path === path ? image : {};
}

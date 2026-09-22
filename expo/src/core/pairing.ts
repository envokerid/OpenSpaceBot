import type { Endpoint, Invite } from './types.ts';

export function endpoint(raw: string, kind?: Endpoint['kind'], priority = 0): Endpoint {
  const value = raw.trim();
  if (!value || value.length > 2048 || /[\s\\]/.test(value)) throw new Error('Enter a valid computer address.');
  const explicit = /^https?:\/\//i.test(value);
  const url = new URL(explicit ? value : `http://${value}`);
  if (!explicit && !url.port) url.port = '8810';
  if (url.port && Number(url.port) < 1) throw new Error('Use a port between 1 and 65535.');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('Use an HTTP or HTTPS address without a path, password, or query.');
  }
  const tailnet = url.hostname.replace(/\.$/, '').endsWith('.ts.net');
  const inferred = url.protocol === 'https:' ? 'hosted' : tailnet ? 'tailnet' : url.hostname.endsWith('.local') ? 'bonjour' : 'lan';
  const resolved = kind ?? inferred;
  if (!['hosted', 'tailnet', 'lan', 'bonjour'].includes(resolved) ||
      (resolved === 'hosted') !== (url.protocol === 'https:') ||
      (resolved === 'tailnet' && !tailnet) || !Number.isInteger(priority) || priority < 0 || priority > 1_000_000) {
    throw new Error('The pairing link contains an invalid route.');
  }
  return { url: url.origin, kind: resolved, priority };
}

export const protectedRoute = (e: Endpoint) => e.kind === 'hosted' || e.kind === 'tailnet';

// A protected pairing can never fall back to cleartext LAN. Local consent is
// for one exact origin, not every address advertised by a QR code.
export function automaticEndpoints(endpoints: Endpoint[]): Endpoint[] {
  const first = endpoints[0];
  return endpoints.filter((e, i) => (e.url === first?.url || protectedRoute(e)) && endpoints.findIndex(x => x.url === e.url) === i);
}

export function normalizeCredential(raw: string): { credential: string; server: boolean } {
  const value = raw.trim();
  if (/^\d{6}$/.test(value) || /^omb_pair_[\w-]{43}$/.test(value)) return { credential: value, server: false };
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/.test(normalized)) return { credential: normalized, server: true };
  throw new Error('Enter the six-digit desktop code or the twelve-character server code.');
}

function uniqueParams(raw: string): URLSearchParams {
  const params = new URLSearchParams(raw);
  const seen = new Set<string>();
  for (const [key] of params) {
    if (seen.has(key)) throw new Error('The pairing link repeats a field.');
    seen.add(key);
  }
  return params;
}

export function parseInvite(value: string): Invite {
  const url = new URL(value.trim());
  if (['https:', 'http:'].includes(url.protocol) && url.pathname === '/pair' && !url.search) {
    const { credential, server } = normalizeCredential(uniqueParams(url.hash.slice(1)).get('code') ?? '');
    if (!server || url.username || url.password) throw new Error('Invalid server pairing link.');
    return { name: url.hostname, endpoints: [endpoint(url.origin)], credential, server };
  }
  if (url.protocol !== 'openmausbot:' || url.hostname !== 'pair' || url.hash || url.username || url.password) throw new Error('Scan an OpenMausBot pairing QR code.');
  const params = uniqueParams(url.search);
  const { credential, server } = normalizeCredential(params.get('token') ?? params.get('code') ?? '');
  if (server) throw new Error('Invalid desktop pairing link.');
  let endpoints = [endpoint(params.get('address') ?? '')];
  const encoded = params.get('endpoints');
  if (encoded !== null) {
    if (!/^[\w-]{1,8192}$/.test(encoded)) throw new Error('Invalid pairing routes.');
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    if (!Array.isArray(decoded) || !decoded.length || decoded.length > 8) throw new Error('Invalid pairing routes.');
    endpoints = decoded.map(e => endpoint(e.url, e.kind, e.priority)).sort((a, b) => a.priority - b.priority);
  }
  const name = [...(params.get('name') ?? endpoints[0].url)].filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').slice(0, 80);
  return { name, endpoints: automaticEndpoints(endpoints), credential, server: false };
}

export function manualInvite(address: string, code: string): Invite {
  if (address.includes('://pair') || address.includes('/pair#')) return parseInvite(address);
  const e = endpoint(address);
  return { name: new URL(e.url).hostname, endpoints: [e], ...normalizeCredential(code) };
}

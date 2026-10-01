import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConnectorAuthFlow } from './ConnectorAuthFlow';
import type { ConnectorAuthState } from '../../shared/connector-auth';
const render = (state: Partial<ConnectorAuthState>) => renderToStaticMarkup(createElement(ConnectorAuthFlow, {
  initial: { id: 'request', accountId: 'account', slug: 'fixture', expiresAt: Date.now() + 600000, kind: 'pending', ...state }, onDone() {}, onClose() {},
}));
describe('connector authentication screens', () => {
  it('uses secret fields for credentials and a real form submission', () => {
    const html = render({ kind: 'form', fields: [{ key: 'token', label: 'Provider token', secret: true }] });
    expect(html).toContain('type="password"'); expect(html).toContain('autoComplete="off"'); expect(html).toContain('<form');
  });
  it('offers browser and localhost handoff actions only for the matching flow', () => {
    const browser = render({ kind: 'browser', manualCallback: true, url: 'https://provider.invalid/authorize' });
    expect(browser).toContain('Open sign-in link'); expect(browser).toContain('Finish sign-in');
    expect(render({ kind: 'browser', manualCallback: false })).not.toContain('Callback address');
  });
  it('renders a provider QR on desktop and never offers it as an OAuth URL', () => {
    const qr = render({ kind: 'qr', qrDataUrl: 'data:image/png;base64,ZmFrZQ==' });
    expect(qr).toContain('alt="Pair fixture"'); expect(qr).toContain('linked-devices'); expect(qr).not.toContain('Open sign-in link');
  });
  it('makes explicit that connecting does not grant bot access', () => {
    const connected = render({ kind: 'connected' });
    expect(connected).toContain('choose which bots may use it'); expect(connected).not.toContain('Cancel connection');
  });
});

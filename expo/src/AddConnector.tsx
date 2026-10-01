import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Session } from './core/session';
import { Button, Card, ErrorNotice, Input, Label, Row, useAction } from './ui';
export function AddConnector({ session, onAdded }: { session: Session; onAdded(): void }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    const client = session.client;
    void (client.connection.server
      ? client.request<{ scopes?: string[] }>("/api/auth/session").then(info => info.scopes?.includes("admin") === true)
      : client.request<{ allowed: boolean }>("/api/companion/settings-access").then(info => info.allowed)
    ).then(value => { if (active) setAllowed(value); }).catch(() => {});
    return () => { active = false; };
  }, [session.client]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const [url, setUrl] = useState('');
  const [auth, setAuth] = useState<'oauth' | 'token' | 'none'>('oauth');
  const [clientId, setClientId] = useState('');
  const action = useAction();
  if (!allowed) return null;
  if (!open) return <Button title="Add remote MCP integration" text onPress={() => setOpen(true)} />;
  return <Card gap={12}>
    <Label bold>Add integration</Label>
    <Label muted>Use the provider’s Streamable HTTP MCP endpoint. OpenClaw stores credentials on your server.</Label>
    <Input label="Name" value={label} onChangeText={setLabel} />
    <Input label="ID (lowercase, numbers, hyphens)" value={slug} onChangeText={setSlug} autoCapitalize="none" />
    <Input label="MCP server URL" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
    <Label>Authentication</Label>
    <View style={{ gap: 4 }}>{(['oauth', 'token', 'none'] as const).map(value => <Button key={value} title={`${auth === value ? '✓ ' : ''}${value === 'oauth' ? 'Browser OAuth' : value === 'token' ? 'Access token' : 'No authentication'}`} text onPress={() => setAuth(value)} />)}</View>
    {auth === 'oauth' && <Input label="OAuth client ID (optional)" value={clientId} onChangeText={setClientId} autoCapitalize="none" />}
    <ErrorNotice error={action.error} />
    <Row><Button title="Cancel" text onPress={() => setOpen(false)} /><Button title="Add integration" primary disabled={action.busy || !label || !slug || !url} onPress={() => void action.run(async () => {
      await session.client.request('/api/connectors/providers', 'POST', { label, slug, url, auth, ...(clientId ? { clientId } : {}) });
      setOpen(false); setLabel(''); setSlug(''); setUrl(''); setClientId(''); onAdded();
    })} /></Row>
  </Card>;
}

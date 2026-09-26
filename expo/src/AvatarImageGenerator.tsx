import React, { useEffect, useState } from 'react';
import type { AvatarImageProvider } from '../../shared/image-generation';
import type { Client } from './core/client';
import { imageConnectionPatch, imageKeyRemoval } from './core/avatarSettings';
import type { WorkspaceConfig } from './settings/shared';
import { ActionRow, Choice, ErrorNotice, FormSection, Input, Label } from './ui';

const PROVIDERS = [{ id: 'openai', label: 'OpenAI' }, { id: 'xai', label: 'Grok (xAI)' }, { id: 'custom', label: 'Custom' }];
export function AvatarImageGenerator({ client, busy, canEdit, run, onGenerate, error }: {
  error?: string; client: Client; busy: boolean; canEdit: boolean;
  run: (operation: () => Promise<unknown>) => Promise<void>;
  onGenerate: (direction: string) => Promise<void>;
}) {
  const [config, setConfig] = useState<WorkspaceConfig>();
  const [access, setAccess] = useState(client.connection.server && canEdit);
  const [providerDraft, setProvider] = useState<AvatarImageProvider>();
  const [urlDraft, setUrl] = useState<string>();
  const [modelDraft, setModel] = useState<string>();
  const [key, setKey] = useState('');
  const [direction, setDirection] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const load = async () => {
    setLoadError('');
    setConfig(await client.request<WorkspaceConfig>('/api/config'));
    if (!client.connection.server) setAccess((await client.request<{ allowed: boolean }>('/api/companion/settings-access')).allowed);
  };
  useEffect(() => {
    let alive = true;
    void Promise.all([client.request<WorkspaceConfig>('/api/config'), client.connection.server ? Promise.resolve({ allowed: canEdit }) : client.request<{ allowed: boolean }>('/api/companion/settings-access')])
      .then(([next, grant]) => { if (alive) { setConfig(next); setAccess(grant.allowed); } })
      .catch(error => { if (alive) setLoadError(error instanceof Error ? error.message : 'Could not load image settings.'); });
    return () => { alive = false; };
  }, [client, canEdit]);
  const image = config?.imageGen;
  const savedProvider = image?.provider ?? 'openai';
  const provider = providerDraft ?? savedProvider as AvatarImageProvider;
  const url = urlDraft ?? image?.customUrl ?? '';
  const model = modelDraft ?? image?.customModel ?? '';
  const dirty = provider !== savedProvider || !!key.trim() || (provider === 'custom' && (url.trim() !== (image?.customUrl ?? '') || model.trim() !== (image?.customModel ?? '')));
  const configured = provider === savedProvider && image?.configured === true;
  const keyConfigured = provider === 'custom' ? image?.customKeyConfigured : provider === 'xai' ? image?.xaiConfigured ?? config?.xai?.configured : image?.openaiConfigured ?? (savedProvider === 'openai' && configured);
  const disabled = busy || !canEdit;
  const save = async () => {
    const next = await client.request<WorkspaceConfig>('/api/config', 'PATCH', imageConnectionPatch(provider, url, model, key));
    setConfig(next); setKey(''); setProvider(undefined); setUrl(undefined); setModel(undefined);
  };
  return <FormSection title="Generate an avatar" footer="Uses the shared workspace image provider. Keys are saved on the connected computer and are never returned to this phone.">
    {!!loadError && <Label accessibilityRole="alert">{loadError}</Label>}
    <ErrorNotice error={error} />
    <Choice label="Image provider" value={provider} options={PROVIDERS} disabled={disabled || !access || !config} onChange={id => { setProvider(id as AvatarImageProvider); setKey(''); setUrl(undefined); setModel(undefined); setExpanded(true); }} />
    <Label muted size={13}>{configured ? `Ready · ${image?.model ?? (provider === 'custom' ? model : PROVIDERS.find(p => p.id === provider)?.label)}` : 'Save an image provider connection to generate avatars.'}</Label>
    {!access && <Label muted size={13}>{client.connection.server ? 'Workspace administrator access is required to change providers.' : 'Enable “Manage workspace settings” for this phone in desktop Settings → Remote access to change providers.'}</Label>}
    <ActionRow title={expanded ? 'Hide connection settings' : 'Connection settings'} disabled={busy} onPress={() => setExpanded(!expanded)} />
    {(expanded || !configured) && <>
      {provider === 'custom' && <>
        <Input label="Base URL" value={url} onChangeText={setUrl} editable={!disabled && access} autoCapitalize="none" autoCorrect={false} placeholder="http://127.0.0.1:4000/v1" />
        <Input label="Image model" value={model} onChangeText={setModel} editable={!disabled && access} autoCapitalize="none" autoCorrect={false} maxLength={200} />
        <Label muted size={13}>OpenAI-compatible Images API. Localhost refers to the connected computer.</Label>
      </>}
      <Input label={`${PROVIDERS.find(p => p.id === provider)?.label} image API key${provider === 'custom' ? ' (optional)' : ''}`} value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!disabled && access} placeholder={keyConfigured ? 'Saved key · enter to replace' : 'API key'} />
      <ActionRow title="Save connection" icon="check" disabled={disabled || !access || !config || (provider === 'custom' ? !url.trim() || !model.trim() : !key.trim() && !dirty)} onPress={() => void run(save)} />
      {!!keyConfigured && <ActionRow title="Remove saved key" icon="delete" danger disabled={disabled || !access} onPress={() => void run(async () => { setConfig(await client.request<WorkspaceConfig>('/api/config', 'PATCH', imageKeyRemoval(provider))); setKey(''); })} />}
    </>}
    <ActionRow title="Refresh image settings" disabled={busy} onPress={() => void run(load)} />
    <Input label="Art direction (optional)" value={direction} onChangeText={setDirection} maxLength={400} multiline editable={!disabled} style={{ minHeight: 86 }} placeholder="Describe the look you want, or leave blank to use the bot's identity." />
    <Label muted size={13}>{direction.length}/400</Label>
    {dirty && <Label muted size={13}>Save your connection changes before generating.</Label>}
    <ActionRow title={generating ? 'Generating…' : 'Generate avatar'} icon="photo" disabled={disabled || !configured || dirty} onPress={() => void run(async () => { setGenerating(true); try { await onGenerate(direction); } finally { setGenerating(false); } })} />
  </FormSection>;
}

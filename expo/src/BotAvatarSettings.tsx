import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Image, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { BOT_AVATAR_CROPS } from '../../shared/bot-avatar';
import { MAUS_COLORS, MAUS_COLOR_NAMES, type MascotState } from '../../shared/mascot-appearance';
import { MASCOT_BODIES, MASCOT_BODY_IDS } from '../../shared/mascot-bodies';
import { parseOrganizationBranding } from '../../electron/organization-branding.mjs';
import type { ManagedDesktopState } from '../../electron/managed-desktop.mjs';
import type { Session } from './core/session';
import { canAdminister, type Bot } from './core/types';
import { generateAvatar, RESET_MASCOT, uploadedAvatar, type AvatarPatch } from './core/avatarSettings';
import { avatarAppearance, avatarEditorFor } from './core/avatarEditor';
import { uploadFile } from './attachments';
import { desktopRequest } from './settings/Desktop';
import { MASCOT_SCENARIOS } from '../../shared/mascot-triggers';
import { Avatar } from './Avatar';
import { AvatarImageGenerator } from './AvatarImageGenerator';
import { ActionRow, ErrorNotice, FormSection, Label, Row, useAction, useTheme } from './ui';

function Swatch({ label, selected, disabled, onPress, children }: React.PropsWithChildren<{ label: string; selected: boolean; disabled: boolean; onPress: () => void }>) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={{ minWidth: 52, minHeight: 52, padding: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: selected ? c.accent : 'transparent', backgroundColor: c.chrome, opacity: disabled ? 0.4 : 1 }}>{children}</Pressable>;
}
export function BotAvatarSettings({ session, bot, identity, disabled: profileBusy }: { session: Session; bot: Bot; identity: { name: string; title: string; description: string }; disabled: boolean }) {
  const action = useAction();
  const theme = useTheme();
  const [preview, setPreview] = useState<MascotState>();
  // This component is keyed by bot ID. The queue survives renders and is
  // flushed on close so a quick tap followed by Back still saves.
  const [editor] = useState(() => avatarEditorFor(session, bot));
  const draft = useSyncExternalStore(editor.subscribe, editor.snapshot, editor.snapshot);
  const avatar = { ...bot, ...draft.appearance };
  useEffect(() => () => { void editor.flush().catch(() => {}); }, [editor]);
  const [organization, setOrganization] = useState<ManagedDesktopState>();
  const client = session.client;
  const canEdit = canAdminister(client.connection);
  const busy = profileBusy || action.busy;
  const disabled = busy || !canEdit;
  useEffect(() => { editor.receive({ color: bot.color, mascotBody: bot.mascotBody, mascotExpression: bot.mascotExpression, avatarCrop: bot.avatarCrop, avatarUrl: bot.avatarUrl }); }, [editor, bot.color, bot.mascotBody, bot.mascotExpression, bot.avatarCrop, bot.avatarUrl]);
  useEffect(() => {
    let alive = true;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    if (!client.connection.server) void client.request<{ allowed: boolean; desktop: boolean }>('/api/companion/settings-access').then(async access => {
      if (!access.allowed || !access.desktop || !alive) return;
      const state = await desktopRequest<ManagedDesktopState>(client, 'organization:state');
      if (!alive || !state.expiresAt || state.expiresAt <= Date.now() || !['connected', 'unavailable'].includes(state.status)) return;
      setOrganization(state);
      expiry = setTimeout(() => setOrganization(undefined), Math.min(state.expiresAt - Date.now(), 2_147_483_647));
    }).catch(() => { /* Optional desktop branding is unavailable on ordinary connections. */ });
    return () => { alive = false; clearTimeout(expiry); };
  }, [client]);
  const icons = useMemo(() => parseOrganizationBranding(organization?.branding).icons, [organization?.branding]);
  const crop = avatar.avatarCrop ?? 'mascot';
  const patch = async (fields: AvatarPatch) => {
    editor.edit(fields);
    await editor.flush();
  };
  const choose = (fields: AvatarPatch) => { editor.edit(fields); };
  return <>
    <FormSection title="Avatar" footer="Changes save automatically. PNG, JPEG, GIF, or WebP · up to 10 MB.">
      <ErrorNotice error={action.error ?? draft.error} />
      <Label size={12} muted accessibilityLiveRegion="polite">{draft.error ? 'Changes are not saved yet.' : draft.pending || draft.saving ? 'Saving…' : 'Changes saved'}</Label>
      {!!draft.error && <ActionRow title="Retry saving avatar" disabled={disabled} onPress={() => void editor.flush().catch(() => {})} />}
      <View style={{ alignItems: 'center', paddingVertical: 8 }}><Avatar bot={avatar} client={client} size={112} state={preview} /></View>
      {!!icons.length && <><Label muted size={13}>{organization?.organization?.name} icons</Label><Row>{icons.map(icon => <Swatch key={icon.id} label={`Use ${icon.name} icon`} selected={false} disabled={disabled} onPress={() => void action.run(async () => {
        await editor.flush();
        const bytes = Uint8Array.from(atob(icon.image.slice(22)), character => character.charCodeAt(0));
        const saved = await client.upload(bytes, `${icon.id}.png`, 'image/png', randomUUID());
        await patch(uploadedAvatar(saved.path, crop));
      })}><Image source={{ uri: icon.image }} style={{ width: 40, height: 40 }} /></Swatch>)}</Row></>}
      <ActionRow title="Upload image" icon="add" disabled={disabled} onPress={() => void action.run(async () => {
        await editor.flush();
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        if (result.canceled) return;
        const item = result.assets[0];
        const mime = item.mimeType ?? 'image/jpeg';
        if (!/^image\/(png|jpeg|gif|webp)$/.test(mime)) throw new Error('Choose a PNG, JPEG, GIF, or WebP image.');
        const saved = await uploadFile(client, item.uri, item.fileName ?? 'avatar.jpg', mime);
        await patch(uploadedAvatar(saved.path, crop));
      })} />
      {!!avatar.avatarUrl && <ActionRow title="Remove custom image" icon="delete" danger disabled={disabled} onPress={() => choose({ avatarUrl: null, avatarCrop: 'mascot' })} />}
      <Label muted size={13}>Shape</Label>
      <Row>{BOT_AVATAR_CROPS.map(value => <Swatch key={value} label={`Use ${value} shape`} selected={crop === value} disabled={disabled} onPress={() => choose({ avatarCrop: value })}><Label size={13}>{value[0].toUpperCase() + value.slice(1)}</Label></Swatch>)}</Row>
      {crop === 'mascot' && <>
        <Label muted size={13}>Expressions follow your bot’s activity. Try an emotion below.</Label>
        <Label muted size={13}>Preview emotions</Label>
        <Row><Swatch label="Follow bot activity" selected={!preview} disabled={false} onPress={() => setPreview(undefined)}><Label size={13}>Automatic</Label></Swatch>
          {(['idle', 'listening', 'thinking', 'searching', 'working', 'celebrate', 'alerting', 'sleeping'] as MascotState[]).map(state => <Swatch key={state} label={`Preview ${state} emotion`} selected={preview === state} disabled={false} onPress={() => setPreview(state)}><Label size={13}>{state[0].toUpperCase() + state.slice(1)}</Label></Swatch>)}
        </Row>
        <Label muted size={13}>Try a situation</Label>
        <Row>{MASCOT_SCENARIOS.map(({ label, state }) => <Swatch key={state} label={`Preview ${label.toLowerCase()}`} selected={preview === state} disabled={false} onPress={() => setPreview(state)}><Label size={13}>{label}</Label></Swatch>)}</Row>
        <Label muted size={13}>Color</Label>
        <Row>{MAUS_COLOR_NAMES.map(value => <Swatch key={value} label={`Use ${value} mascot color`} selected={avatar.color === value} disabled={disabled} onPress={() => choose({ color: value })}><View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: MAUS_COLORS[value], borderWidth: value === 'white' ? 1 : 0, borderColor: theme.line }} /></Swatch>)}</Row>
        <Label muted size={13}>Body</Label>
        <Row>{MASCOT_BODY_IDS.map(id => <Swatch key={id} label={`Use the ${id === 'cursor' ? 'Orb' : MASCOT_BODIES[id].name} body`} selected={(avatar.mascotBody ?? 'cursor') === id} disabled={disabled} onPress={() => choose({ mascotBody: id })}><Avatar bot={{ ...avatar, mascotBody: id }} client={client} size={38} animated={false} /></Swatch>)}</Row>
      </>}
      <ActionRow title="Reset mascot" disabled={disabled} onPress={() => { setPreview(undefined); choose(RESET_MASCOT); }} />
    </FormSection>
    <AvatarImageGenerator client={client} busy={busy} error={action.error} canEdit={canEdit && !!identity.name.trim()} run={action.run} onGenerate={async direction => {
      await editor.flush();
      const next = await generateAvatar(client, bot.id, direction, { ...identity, name: identity.name.trim() });
      session.applyAvatar(bot.id, avatarAppearance(next));
      editor.receive(next);
    }} />
  </>;
}

import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from './core/session';
import type { Bot, Destination, Instance } from './core/types';
import { canAdminister } from './core/types';
import { routeId } from './core/client';
import { Icon } from './Icon';
import { BotAvatarSettings } from './BotAvatarSettings';
import { VoicePreview } from './VoicePreview';
import { Overview } from './Overview';
import { BotPermissions } from './BotPermissions';
import { ActionRow, Button, Choice, ErrorNotice, FormSection, Header, Input, Label, Row, SettingsSurface, SettingRow, Sheet, Toggle, useAction, useTheme } from './ui';
interface Config { tts?: { configured?: boolean; apiKeyConfigured?: boolean; provider?: string; voice?: string } }
export function Profile(props: React.ComponentProps<typeof ProfileContent>) {
 return <SettingsSurface modal><ProfileContent {...props} /></SettingsSurface>;
}
function ProfileContent({ session, bot, destination, onBack }: { session: Session; bot: Bot; destination: Destination; onBack: () => void }) {
 const c = useTheme(); const [name, setName] = useState(bot.name); const [title, setTitle] = useState(bot.title); const [description, setDescription] = useState(bot.description); const [notify, setNotify] = useState(bot.notifications); const [voice, setVoice] = useState(bot.voice ?? ''); const [speak, setSpeak] = useState(bot.speakReplies ?? false);
 const [instances, setInstances] = useState<Instance[]>([]); const [config, setConfig] = useState<Config>(); const [voices, setVoices] = useState<{ id: string; label: string }[]>([]); const [overview, setOverview] = useState(false); const action = useAction(); const admin = canAdminister(session.client.connection);
 const task = bot.tasks?.find(t => t.threadId === destination.threadId); const savedModel = task?.modelSelection ?? bot.modelSelection; const [provider, setProvider] = useState(savedModel.instanceId); const [model, setModel] = useState(savedModel.model); const [effort, setEffort] = useState(savedModel.effort ?? '');
 const patch = async (fields: Record<string, unknown>) => { await session.client.request(`/api/bots/${routeId(bot.id)}/profile`, 'PATCH', fields); await session.refresh(); };
 // Model/voice discovery must not lock the avatar picker while a provider is slow.
 useEffect(() => {
  let alive = true;
  void session.client.instances().then(value => { if (alive) setInstances(value.instances); }).catch(() => {});
  void session.client.request<Config>('/api/config').then(value => { if (alive) setConfig(value); }).catch(() => {});
  void session.client.request<{ voices: { id: string; label: string }[] }>('/api/tts/voices').then(value => { if (alive) setVoices(value.voices); }).catch(() => {});
  return () => { alive = false; };
 }, [session]);
 const instance = instances.find(i => i.instanceId === provider); const configured = config?.tts?.configured || config?.tts?.apiKeyConfigured; const engine = config?.tts?.provider ?? 'elevenlabs';
 const [permissions, setPermissions] = useState(false);
 if (permissions) return <BotPermissions key={bot.id} session={session} bot={bot} onBack={() => setPermissions(false)} />;
 return <><Sheet full onClose={onBack}><Header title="Bot settings" onBack={onBack} /><ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 24, gap: 16 }} keyboardShouldPersistTaps="handled">{action.error && <View style={{ paddingHorizontal: 16 }}><ErrorNotice error={action.error} /></View>}
 <FormSection><SettingRow title="What this bot does" icon="info" onPress={() => setOverview(true)} /><SettingRow title="Permissions" icon="settings" onPress={() => setPermissions(true)} /></FormSection>

 <FormSection title="Model" footer="Provider accounts and API keys stay on your computer. Default sends no reasoning level and lets the provider decide."><Choice label="Provider" value={provider} options={instances.map(i => ({ id: i.instanceId, label: i.displayName }))} onChange={id => { setProvider(id); setModel(instances.find(i => i.instanceId === id)?.models.default ?? ''); }} /><Choice label="Model" value={model} options={instance?.models.options.map(m => ({ id: m.id, label: m.label ?? m.id })) ?? [{ id: model, label: model }]} onChange={setModel} /><Choice label="Reasoning effort" value={effort} options={[{ id: '', label: 'Default' }, ...(instance?.capabilities?.effortLevels ?? []).map(id => ({ id, label: id.slice(0, 1).toUpperCase() + id.slice(1) }))]} onChange={setEffort} /><ActionRow title="Apply model" icon="check" disabled={action.busy || !admin || task?.busy || (model === savedModel.model && provider === savedModel.instanceId && effort === (savedModel.effort ?? ''))} onPress={() => void action.run(async () => { await session.client.task(destination, 'PATCH', { modelSelection: { instanceId: provider, model, ...(effort ? { effort } : {}) }, requireAvailableModel: true }); await session.refresh(); })} /></FormSection>
 <BotAvatarSettings key={bot.id} session={session} bot={bot} identity={{ name, title, description }} disabled={action.busy} />
 <FormSection title="Identity"><Input label="Name" value={name} onChangeText={setName} /><Input label="Title" value={title} onChangeText={setTitle} /><Input label="What this agent does" value={description} onChangeText={setDescription} multiline style={{ minHeight: 104 }} /><Row><Label style={{ flex: 1 }}>Agent notifications</Label><Toggle label="Agent notifications" value={notify} onChange={setNotify} /></Row></FormSection>
 <FormSection title="Voice"><Choice label="Voice engine" value={engine} options={[{ id: 'elevenlabs', label: 'ElevenLabs' }, { id: 'fish', label: 'Fish Audio' }, { id: 'chatterbox', label: 'Chatterbox' }, { id: 'system', label: 'Built-in' }]} disabled={action.busy || !admin} onChange={next => void action.run(async () => { setConfig(await session.client.request<Config>('/api/config', 'PUT', { tts: { provider: next } })); setVoices((await session.client.request<{ voices: { id: string; label: string }[] }>('/api/tts/voices')).voices); setVoice(''); })} />{configured ? <><Choice label="Voice" value={voice} options={[{ id: '', label: 'Workspace default' }, ...voices]} onChange={setVoice} /><Row><Label style={{ flex: 1 }}>Speak replies</Label><Toggle label="Speak replies" value={speak} onChange={setSpeak} /></Row><VoicePreview client={session.client} name={name} voice={voice} /></> : <><Row style={{ gap: 10 }}><Icon name="volumeOff" size={18} color={c.muted} /><Label size={13} muted>{engine === 'elevenlabs' ? 'ElevenLabs' : engine} is not configured</Label></Row><Label size={13} muted>Add the shared ElevenLabs key in this agent's profile on the computer. The key is never returned to this phone.</Label></>}</FormSection>
 <FormSection><Button title="Save profile changes" primary disabled={action.busy || !name.trim() || !admin} onPress={() => void action.run(() => patch({ name: name.trim(), title, description, notifications: notify, voice, speakReplies: speak }))} /></FormSection>
 </ScrollView></Sheet>{overview && <Modal animationType="slide" onRequestClose={() => setOverview(false)}><SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}><Overview session={session} botId={bot.id} name={bot.name} onBack={() => setOverview(false)} /></SafeAreaView></Modal>}</>;
}

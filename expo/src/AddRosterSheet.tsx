import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { Session } from './core/session';
import { canAdminister, type Bot } from './core/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Button, ErrorNotice, IconButton, Input, Label, Row, Sheet, useAction, useTheme } from './ui';

export function AddRosterSheet({ session, bots, onClose, onCreated }: {
  session: Session;
  bots: Bot[];
  onClose: () => void;
  onCreated: (bot: Bot) => void;
}) {
  const c = useTheme();
  const action = useAction();
  const [tab, setTab] = useState<'bot' | 'section'>('bot');
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const candidates = bots.filter(bot => !bot.hidden);
  const selected = members.filter(id => candidates.some(bot => bot.id === id));
  const allowed = canAdminister(session.client.connection);
  const close = () => { if (!action.busy) onClose(); };
  const create = () => action.run(async () => {
    if (!allowed) return;
    if (tab === 'bot') {
      const { bot } = await session.client.request<{ bot: Bot }>('/api/bots', 'POST', {});
      onCreated(bot);
      onClose();
    } else {
      if (!name.trim() || !selected.length) return;
      await session.client.request('/api/sidebar-sections', 'POST', { name: name.trim(), botIds: selected });
      onClose();
    }
    // Creation has already succeeded; a refresh failure must not offer a duplicate POST.
    await session.refresh();
  });

  return <Sheet title="Add" onClose={close} action={<IconButton icon="close" label="Close" chrome={false} disabled={action.busy} onPress={close} />}>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', marginHorizontal: 20, marginTop: 8, marginBottom: 16, padding: 4, borderRadius: 16, backgroundColor: c.chrome }}>
      {(['bot', 'section'] as const).map(option => <Pressable key={option} accessibilityRole="tab" accessibilityLabel={option === 'bot' ? 'Bot' : 'Section'} accessibilityState={{ selected: tab === option, disabled: action.busy }} disabled={action.busy}
        onPress={() => { action.clearError(); setTab(option); }}
        style={{ flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === option ? c.card : 'transparent' }}>
        <Label bold={tab === option} style={{ color: tab === option ? c.accent : c.muted }}>{option === 'bot' ? 'Bot' : 'Section'}</Label>
      </Pressable>)}
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, gap: 10 }}>
      {tab === 'bot' ? <View style={{ gap: 8, paddingBottom: 12 }}>
        <Label size={20} bold>Create a bot</Label>
        <Label muted>Start a new conversation with a bot. You can customize its name and profile after creating it.</Label>
      </View> : <>
        <Input label="Section name" value={name} onChangeText={setName} editable={!action.busy} maxLength={60} />
        <Row><Label size={12} muted style={{ flex: 1 }}>Choose bots to organize into this section.</Label><Label size={12} muted>{name.length}/60</Label></Row>
        <Label size={13} bold muted>Bots</Label>
        {!candidates.length && <Label muted>Create a bot first, then add it to a section.</Label>}
        {candidates.map(bot => <Pressable key={bot.id} accessibilityRole="checkbox" accessibilityLabel={bot.name} accessibilityState={{ checked: selected.includes(bot.id), disabled: action.busy }} disabled={action.busy}
          onPress={() => setMembers(ids => ids.includes(bot.id) ? ids.filter(id => id !== bot.id) : [...ids, bot.id])}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, marginVertical: -5 }}>
          <Avatar bot={bot} client={session.client} size={36} />
          <Label size={16} bold style={{ flex: 1 }}>{bot.name}</Label>
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: selected.includes(bot.id) ? 0 : 1, borderColor: c.muted }}>
            {selected.includes(bot.id) && <Icon name="checkCircle" size={20} color={c.accent} />}
          </View>
        </Pressable>)}
      </>}
      <ErrorNotice error={action.error} />
    </ScrollView>
    <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
      <Button title={action.busy ? 'Creating…' : tab === 'bot' ? 'Create bot' : 'Create section'} primary
        disabled={!allowed || action.busy || (tab === 'section' && (!name.trim() || !selected.length))} onPress={() => void create()} />
    </View>
  </Sheet>;
}

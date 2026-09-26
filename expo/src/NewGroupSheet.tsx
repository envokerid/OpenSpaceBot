import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { Session } from './core/session';
import type { Bot, Group } from './core/types';
import { Avatar } from './Avatar';
import { GroupInstructions } from './GroupInstructions';
import { Icon } from './Icon';
import { Button, ErrorNotice, FormSection, Input, Label, SettingsSurface, Sheet, useAction, useTheme } from './ui';

export function NewGroupSheet(props: React.ComponentProps<typeof NewGroupContent>) {
  return <SettingsSurface modal><NewGroupContent {...props} /></SettingsSurface>;
}

function NewGroupContent({ session, bots, onClose, onCreated }: {
  session: Session; bots: Bot[]; onClose: () => void; onCreated: (group: Group) => void;
}) {
  const c = useTheme();
  const action = useAction();
  const [name, setName] = useState('');
  const [bulletin, setBulletin] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [closing, setClosing] = useState(false);
  const close = () => { if (!action.busy) setClosing(true); };
  const create = () => action.run(async () => {
    if (closing) return;
    const { group } = await session.client.createGroup(name, members, bulletin);
    onClose();
    await session.refresh();
    onCreated(group);
  });

  return <Sheet slide swipeToDismiss={!action.busy} closing={closing} onDismiss={onClose}
    title="New group" closeLabel="Back" headerPaddingHorizontal={16} onClose={close}
    action={<Button title={action.busy ? 'Creating…' : 'Create'} text disabled={action.busy || closing || !members.length} onPress={() => void create()} />}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8, paddingBottom: 24, gap: 16 }}>
      <FormSection title="Group name">
        <Input accessibilityLabel="Group name" placeholder="Group name (optional)" value={name} onChangeText={setName} editable={!action.busy} maxLength={100} />
      </FormSection>
      <GroupInstructions value={bulletin} onChange={setBulletin} disabled={action.busy} />
      <FormSection title="Bots in this group" footer="Every bot reads the conversation and proposes who should reply and why. Then everyone votes.">
        {bots.filter(bot => !bot.hidden).map(bot => <Pressable key={bot.id} accessibilityRole="checkbox" accessibilityLabel={bot.name}
          accessibilityState={{ checked: members.includes(bot.id), disabled: action.busy }} disabled={action.busy}
          onPress={() => setMembers(ids => ids.includes(bot.id) ? ids.filter(id => id !== bot.id) : [...ids, bot.id])}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 }}>
          <Avatar bot={bot} client={session.client} size={36} />
          <Label bold style={{ flex: 1 }}>{bot.name}</Label>
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: members.includes(bot.id) ? 0 : 1, borderColor: c.muted }}>
            {members.includes(bot.id) && <Icon name="checkCircle" size={20} color={c.accent} />}
          </View>
        </Pressable>)}
        {!members.length && <Label muted>Choose at least one bot.</Label>}
      </FormSection>
      {action.error && <View style={{ paddingHorizontal: 20 }}><ErrorNotice error={action.error} /></View>}
    </ScrollView>
  </Sheet>;
}

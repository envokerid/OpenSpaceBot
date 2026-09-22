import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { Session } from './core/session';
import { canAdminister, type Bot, type Group } from './core/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Button, ErrorNotice, Label, Sheet, useAction, useTheme } from './ui';

export function GroupMembers({ session, group, bots, onClose }: {
  session: Session; group: Group; bots: Bot[]; onClose: () => void;
}) {
  const c = useTheme();
  const action = useAction();
  const opened = useRef([...group.memberIds]);
  const [picked, setPicked] = useState(() => [...group.memberIds]);
  const candidates = bots.filter(bot => !bot.hidden || group.memberIds.includes(bot.id));
  const allowed = canAdminister(session.client.connection) && !group.dm;
  const close = () => { if (!action.busy) onClose(); };
  const save = () => action.run(async () => {
    if (!allowed || !picked.length) return;
    await session.client.groupMembers(group.id, picked, opened.current);
    onClose();
    await session.refresh();
  });

  return <Sheet title="Manage members" onClose={close} action={<Button title={action.busy ? 'Saving…' : 'Save'} text disabled={!allowed || !picked.length || action.busy} onPress={() => void save()} />}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, gap: 10 }}>
      <Label bold>{group.name}</Label>
      <Label muted>Choose the bots in this group. Existing messages stay in the conversation.</Label>
      {candidates.map(bot => <Pressable key={bot.id} accessibilityRole="checkbox" accessibilityLabel={bot.name}
        accessibilityState={{ checked: picked.includes(bot.id), disabled: action.busy }} disabled={action.busy}
        onPress={() => setPicked(ids => ids.includes(bot.id) ? ids.filter(id => id !== bot.id) : [...ids, bot.id])}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 }}>
        <Avatar bot={bot} client={session.client} size={36} />
        <Label bold style={{ flex: 1 }}>{bot.name}{bot.hidden ? ' (archived)' : ''}</Label>
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: picked.includes(bot.id) ? 0 : 1, borderColor: c.muted }}>
          {picked.includes(bot.id) && <Icon name="checkCircle" size={20} color={c.accent} />}
        </View>
      </Pressable>)}
      {!picked.length && <Label muted>A group needs at least one bot.</Label>}
      <ErrorNotice error={action.error} />
    </ScrollView>
  </Sheet>;
}

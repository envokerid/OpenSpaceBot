import React, { useState } from 'react';
import { View } from 'react-native';
import { BOT_PROFILE_LIMITS } from '../../shared/bot-profile';
import type { Session } from './core/session';
import { canAdminister, type Bot } from './core/types';
import { Menu } from './Menu';
import { Profile } from './Profile';
import { ActionRow, Button, DialogBody, ErrorNotice, Input, Label, Sheet, useAction, useTheme } from './ui';

export function RosterBotActions({ session, bot, threadId, anchor, onClose }: {
  session: Session; bot: Bot; threadId: string; anchor: { x: number; y: number }; onClose: () => void;
}) {
  const c = useTheme();
  const action = useAction();
  const [mode, setMode] = useState<'menu' | 'edit' | 'rename' | 'delete'>('menu');
  const [name, setName] = useState(bot.name);
  const allowed = canAdminister(session.client.connection);
  const close = () => { if (!action.busy) onClose(); };
  const rename = () => action.run(async () => {
    if (!allowed || !name.trim() || name.trim() === bot.name) return;
    await session.client.renameBot(bot.id, name);
    onClose();
    await session.refresh();
  });
  const remove = () => action.run(async () => {
    if (!allowed) return;
    await session.client.deleteBot(bot.id);
    onClose();
    await session.refresh();
  });

  if (mode === 'edit') return <Profile session={session} bot={bot} destination={{ kind: 'bots', id: bot.id, threadId }} onBack={onClose} />;
  if (mode === 'rename') return <Sheet centered title="Rename bot" onClose={close}>
    <DialogBody actions={<>
      <Button title="Cancel" text disabled={action.busy} onPress={close} />
      <Button title={action.busy ? 'Saving…' : 'Save'} text disabled={!allowed || action.busy || !name.trim() || name.trim() === bot.name} onPress={() => void rename()} />
    </>}>
      <Input label="Bot name" value={name} onChangeText={setName} maxLength={BOT_PROFILE_LIMITS.name} autoFocus editable={!action.busy} returnKeyType="done" onSubmitEditing={() => void rename()} />
      <ErrorNotice error={action.error} />
    </DialogBody>
  </Sheet>;
  if (mode === 'delete') return <Sheet centered title={`Delete ${bot.name}?`} onClose={close}>
    <DialogBody actions={<>
      <Button title="Cancel" text disabled={action.busy} onPress={close} />
      <Button title={action.busy ? 'Deleting…' : 'Delete bot'} text danger disabled={!allowed || action.busy} onPress={() => void remove()} />
    </>}>
      <Label muted>This permanently deletes this bot, its chat history, memory and bot workspace files. This cannot be undone.</Label>
      <ErrorNotice error={action.error} />
    </DialogBody>
  </Sheet>;
  return <Menu {...anchor} width={220} borderRadius={20} onClose={onClose}>
    <View style={{ paddingHorizontal: 16 }}>
      <Label numberOfLines={1} size={13} muted style={{ paddingVertical: 8 }}>{bot.name}</Label>
      <ActionRow title="Edit" icon="settings" color={c.text} disabled={!allowed} onPress={() => setMode('edit')} />
      <ActionRow title="Rename" icon="edit" color={c.text} disabled={!allowed} onPress={() => setMode('rename')} />
      <ActionRow title="Delete" icon="delete" danger disabled={!allowed} onPress={() => setMode('delete')} />
    </View>
  </Menu>;
}

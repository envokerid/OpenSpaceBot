import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import type { Session } from './core/session';
import { canAdminister, type Bot } from './core/types';
import { Button, ErrorNotice, Input, Label, RadioRow, Sheet, useAction } from './ui';

export function BotSectionSheet({ session, bot, sections, onClose }: {
  session: Session; bot: Bot; sections: string[]; onClose: () => void;
}) {
  const action = useAction();
  const [selected, setSelected] = useState(bot.section ?? '');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const choices = [...new Set([...sections, bot.section ?? ''].map(section => section.trim()).filter(Boolean))];
  const target = creating ? name.trim() : selected;
  const allowed = canAdminister(session.client.connection);
  const canSave = allowed && !action.busy && (!creating || !!target) && target.length <= 60 && target !== (bot.section ?? '');
  const close = () => { if (!action.busy) onClose(); };
  const save = () => action.run(async () => {
    if (!canSave) return;
    await session.client.moveBotToSection(bot.id, target);
    onClose();
    await session.refresh();
  });
  const choose = (section: string) => { setCreating(false); setSelected(section); action.clearError(); };

  return <Sheet title="Move to section" onClose={close} action={
    <Button title={action.busy ? 'Saving…' : 'Save'} text disabled={!canSave} onPress={() => void save()} />
  }>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 8 }}>
      <Label muted>Choose a section for {bot.name}.</Label>
      <RadioRow title="No section (Bots)" selected={!creating && !selected} disabled={!allowed || action.busy} onPress={() => choose('')} />
      {choices.map(section => <RadioRow key={section} title={section} selected={!creating && selected === section}
        disabled={!allowed || action.busy} onPress={() => choose(section)} />)}
      <RadioRow title="New section" selected={creating} disabled={!allowed || action.busy} onPress={() => { setCreating(true); action.clearError(); }} />
      {creating && <Input label="Section name" value={name} onChangeText={setName} maxLength={60} autoFocus editable={!action.busy}
        returnKeyType="done" onSubmitEditing={() => void save()} />}
      <ErrorNotice error={action.error} />
    </ScrollView>
  </Sheet>;
}

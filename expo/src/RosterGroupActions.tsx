import React, { useState } from 'react';
import { View } from 'react-native';
import type { Session } from './core/session';
import { canAdminister, type Group } from './core/types';
import { Menu } from './Menu';
import { ActionRow, Button, DialogBody, ErrorNotice, Label, Sheet, useAction } from './ui';

export function RosterGroupActions({ session, group, anchor, onClose }: {
  session: Session; group: Group; anchor: { x: number; y: number }; onClose: () => void;
}) {
  const action = useAction();
  const [confirming, setConfirming] = useState(false);
  const allowed = canAdminister(session.client.connection);
  const close = () => { if (!action.busy) onClose(); };
  const remove = () => action.run(async () => {
    if (!allowed) return;
    await session.client.deleteGroup(group.id);
    onClose();
    await session.refresh();
  });

  if (confirming) return <Sheet centered title={`Delete ${group.name}?`} onClose={close}>
    <DialogBody actions={<>
      <Button title="Cancel" text disabled={action.busy} onPress={close} />
      <Button title={action.busy ? 'Deleting…' : 'Delete group'} text danger disabled={!allowed || action.busy} onPress={() => void remove()} />
    </>}>
      <Label muted>This permanently deletes this group and its chat history. The member bots are kept. This cannot be undone.</Label>
      <ErrorNotice error={action.error} />
    </DialogBody>
  </Sheet>;
  return <Menu {...anchor} width={220} borderRadius={20} onClose={onClose}>
    <View style={{ paddingHorizontal: 16 }}>
      <Label numberOfLines={1} size={13} muted style={{ paddingVertical: 8 }}>{group.name}</Label>
      <ActionRow title="Delete" icon="delete" danger disabled={!allowed} onPress={() => setConfirming(true)} />
    </View>
  </Menu>;
}

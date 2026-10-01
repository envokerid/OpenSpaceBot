import React from 'react';
import { Pressable, View } from 'react-native';
import type { Client } from './core/client';
import type { Bot, Group, Message } from './core/types';
import { GroupAvatar } from './GroupAvatar';
import { Icon } from './Icon';
import { UnreadLight } from './UnreadLight';
import { Label, Row, useTheme } from './ui';
import { messageDay } from '../../shared/message-day';

export function RosterGroupRow({ group, bots, client, last, now, onPress, onMenu }: {
  group: Group; bots: Bot[]; client: Client; last?: Message; now: number;
  onPress: () => void; onMenu?: (anchor: { x: number; y: number }) => void;
}) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${group.name}`}
    accessibilityHint={onMenu ? 'Hold to delete this group chat' : undefined}
    accessibilityActions={onMenu ? [{ name: 'longpress', label: 'Show group actions' }] : undefined}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress') onMenu?.({ x: 24, y: 160 }); }}
    onLongPress={onMenu ? event => onMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }) : undefined}
    delayLongPress={450} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', minHeight: 76, paddingLeft: 6, paddingRight: 16, opacity: pressed ? 0.7 : 1 })}>
    <View style={{ width: 10, alignItems: 'center', paddingTop: 34 }}>{group.unread && <UnreadLight />}</View>
    <View style={{ paddingVertical: 12, marginRight: 14 }}><GroupAvatar bots={bots} client={client} name={group.name} size={52} /></View>
    <View style={{ flex: 1, paddingVertical: 12, gap: 4 }}>
      <Row style={{ flexWrap: 'nowrap', gap: 6 }}>
        <Label size={17} bold numberOfLines={1} style={{ flex: 1 }}>{group.name}</Label>
        <Label size={15} muted>{last ? messageDay(last.at, now) : ''}</Label>
        <Icon name="chevron" size={16} color={c.muted + '80'} />
      </Row>
      <Label size={15} muted numberOfLines={1}>{last?.card?.subtitle || last?.card?.title || last?.text || `${bots.length} bot${bots.length === 1 ? '' : 's'}`}</Label>
    </View>
  </Pressable>;
}

import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Bot } from './core/types';
import type { Client } from './core/client';
import { GroupAvatar } from './GroupAvatar';
import { Label, useTheme } from './ui';

export function GroupChip({ name, bots, client, onPress, onMenu, label, expanded, unread = false, style }: {
  name: string; bots: Bot[]; client: Client; onPress: () => void; label: string;
  onMenu?: (anchor: { x: number; y: number }) => void;
  expanded?: boolean; unread?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded }}
    accessibilityHint={onMenu ? 'Hold to delete this group chat' : undefined}
    accessibilityActions={onMenu ? [{ name: 'longpress', label: 'Show group actions' }] : undefined}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress') onMenu?.({ x: 24, y: 160 }); }}
    onLongPress={onMenu ? event => onMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }) : undefined}
    delayLongPress={450}
    onPress={onPress} style={({ pressed }) => [styles.chip, { backgroundColor: c.chrome, opacity: pressed ? 0.7 : 1 }, style]}>
    <GroupAvatar bots={bots} client={client} name={name} size={38} />
    <Label size={15} bold numberOfLines={1} style={{ flexShrink: 1 }}>{name}</Label>
    {unread && <View accessibilityLabel="Unread messages" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.mine, flexShrink: 0 }} />}
  </Pressable>;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    minHeight: 48, maxWidth: '100%', borderRadius: 24,
    paddingLeft: 6, paddingRight: 14, paddingVertical: 6, gap: 8, elevation: 3,
  },
});

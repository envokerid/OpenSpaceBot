import React from 'react';
import { View } from 'react-native';
import type { Bot } from './core/types';
import type { Client } from './core/client';
import { groupAvatarTiles } from './core/groupAvatar';
import { Avatar } from './Avatar';

export function GroupAvatar({ bots, client, name, size = 38 }: { bots: Bot[]; client: Client; name: string; size?: number }) {
  const tiles = groupAvatarTiles(bots.length, size);
  return <View accessibilityLabel={`${name} group avatar`} style={{ width: size, height: size, flexShrink: 0 }}>
    {bots.length ? bots.map((bot, index) => {
      const tile = tiles[index];
      return <View key={bot.id} style={{ position: 'absolute', left: tile.left, top: tile.top, width: tile.size, height: tile.size }}>
        <Avatar bot={bot} client={client} size={tile.size} />
      </View>;
    }) : <Avatar bot={{ name, color: 'blue' }} client={client} size={size} />}
  </View>;
}

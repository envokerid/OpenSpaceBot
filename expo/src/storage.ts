import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { defaultReplies, type QuickReply } from './QuickReplies';
import type { Connection } from './core/types';

const key = 'openmausbot.expo.connections.v1';
const tokenKey = (id: string) => `omb.expo.token.${id}`;
// Web is a UI preview. Credentials deliberately survive only on native.
const webTokens = new Map<string, string>();
export async function connections(): Promise<Connection[]> {
  const data = await AsyncStorage.getItem(key);
  if (!data) return [];
  return JSON.parse(data) as Connection[];
}
export async function token(connection: Connection) {
  return Platform.OS === 'web' ? webTokens.get(connection.id) ?? null : SecureStore.getItemAsync(tokenKey(connection.id));
}
export async function save(connection: Connection, credential: string) {
  if (Platform.OS === 'web') webTokens.set(connection.id, credential);
  else await SecureStore.setItemAsync(tokenKey(connection.id), credential, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  const all = await connections();
  await AsyncStorage.setItem(key, JSON.stringify([...all.filter(c => c.id !== connection.id), connection]));
}
export async function forget(connection: Connection) {
  if (Platform.OS === 'web') webTokens.delete(connection.id);
  else await SecureStore.deleteItemAsync(tokenKey(connection.id));
  await AsyncStorage.setItem(key, JSON.stringify((await connections()).filter(c => c.id !== connection.id)));
}

export interface Preferences { skin?: import('./core/skins').Skin | 'system'; showThreads?: boolean; showDiscussionCards?: boolean; welcomeSeen: boolean; notificationsSeen: boolean; activity: 'off' | 'summary' | 'full'; quickReplies: QuickReply[]; selectedThreads: Record<string, string> }
const defaults: Preferences = { welcomeSeen: false, notificationsSeen: false, activity: 'full', quickReplies: defaultReplies, selectedThreads: {} };
export async function preferences(): Promise<Preferences> { const saved = JSON.parse(await AsyncStorage.getItem('omb.expo.preferences.v1') ?? '{}'); if (saved.quickReplies?.some((r: unknown) => typeof r === 'string')) delete saved.quickReplies; return { ...defaults, ...saved }; }
export async function savePreferences(value: Preferences) { await AsyncStorage.setItem('omb.expo.preferences.v1', JSON.stringify(value)); }

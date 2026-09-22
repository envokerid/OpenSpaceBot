import React from 'react';
import { ScrollView, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Button, IconButton, Label, useTheme } from './ui';

export function Onboarding({ mode, onConnect, onSkip, onSettings, busy }: { mode: 'welcome' | 'unpaired' | 'notifications'; onConnect: () => void; onSkip?: () => void; onSettings?: () => void; busy?: boolean }) {
  const c = useTheme();
  const welcome = mode === 'welcome'; const unpaired = mode === 'unpaired';
  const title = welcome ? 'Take your bots with you' : unpaired ? "Connect when you're ready" : 'Stay in the loop';
  const detail = welcome ? 'Open chats, approve actions, and send new work from your phone.' : unpaired ? 'Pair this phone with OpenMausBot to see your chats and respond to your bots.' : 'Approvals and finished work appear while OpenMausMobile is connected, including frames replayed after a short background pause. Closed-app push needs a separate push-relay release that does not exist yet.';
  const benefits: [IconName, string, string?][] = welcome ? [['send', 'Your chats, in your pocket', 'Pick up the same conversations from your computer.'], ['checkCircle', 'Respond when a bot needs you', 'Review approvals without going back to your desk.'], ['lock', 'Private by design', 'You choose which trusted computer this phone connects to.']] : unpaired ? [] : [['checkCircle', 'Approvals that are waiting for you'], ['send', 'Finished work and important updates']];
  return <View style={{ flex: 1, backgroundColor: c.bg }}>{unpaired && <View style={{ paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderColor: c.line }}><Label bold size={17} style={{ flex: 1, marginLeft: 10 }}>OpenMausBot</Label><IconButton icon="settings" label="Settings" onPress={onSettings!} /></View>}
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 24, gap: 12 }}>
      <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}><Icon name={welcome ? 'send' : unpaired ? 'call' : 'bell'} size={44} color={c.text} /></View>
      <Label size={unpaired ? 24 : 28} bold style={{ textAlign: 'center' }}>{title}</Label><Label size={unpaired || welcome ? 16 : 14} muted style={{ textAlign: 'center', lineHeight: mode === 'notifications' ? 20 : 24 }}>{detail}</Label>
      {unpaired && <Label size={13} muted style={{ textAlign: 'center' }}>On your computer, open OpenMausBot → Settings → Phone.</Label>}
      {!!benefits.length && <View style={{ height: 6 }} />}{benefits.map(([icon, name, description]) => <View key={name} style={{ flexDirection: 'row', gap: 14, alignSelf: 'stretch' }}><Icon name={icon} color={c.accent} /><View style={{ flex: 1, gap: 2 }}><Label size={14} bold style={{ lineHeight: 20 }}>{name}</Label>{description && <Label size={13} muted>{description}</Label>}</View></View>)}
    </ScrollView>
    <View style={{ paddingHorizontal: 24, paddingVertical: 12, gap: 4 }}><Button title={welcome ? 'Connect my computer' : unpaired ? 'Connect computer' : 'Enable notifications'} primary style={{ marginVertical: 4 }} onPress={onConnect} disabled={busy} />{onSkip && <Button title="Not now" text style={{ minHeight: 48 }} onPress={onSkip} disabled={busy} />}</View>
  </View>;
}

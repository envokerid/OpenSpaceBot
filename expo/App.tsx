import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, BackHandler, KeyboardAvoidingView, Linking, Platform, StatusBar, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { fetch as expoFetch } from 'expo/fetch';
import { isRunningInExpoGo } from 'expo';
import { notifications } from './src/notifications';
import * as Sharing from 'expo-sharing';
import { Client } from './src/core/client';
import { Session } from './src/core/session';
import type { Connection, Destination, Draft } from './src/core/types';
import { destinationKey } from './src/core/types';
import * as storage from './src/storage';
import { Pairing } from './src/Pairing';
import { Onboarding } from './src/Onboarding';
import { ConnectedApps } from './src/ConnectedApps';
import { Settings } from './src/Settings';
import { Roster } from './src/Roster';
import { Chat } from './src/Chat';
import { useScreenInsets } from './src/useScreenInsets';
import { Threads } from './src/Threads';
import { Profile } from './src/Profile';
import { Computer } from './src/Computer';
import { Routines } from './src/Routines';
import { uploadFile } from './src/attachments';
import { Button, ErrorNotice, Label, Loading, Row, ThemeProvider, useAction, useTheme } from './src/ui';

const Notifications = notifications;
Notifications?.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });

function Workspace({ visible, session, onSettings, prefs, onPreferences, requested }: { session: Session; onSettings: () => void; prefs: storage.Preferences; onPreferences: (p: storage.Preferences) => void; requested?: Destination; visible: boolean }) {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const [destination, setDestination] = useState<Destination>();
  const [selectedThreads, setSelectedThreads] = useState<Record<string, string>>(prefs.selectedThreads);
  const [around, setAround] = useState<string>();
  const [screen, setScreen] = useState<'roster' | 'chat' | 'threads' | 'profile' | 'computer' | 'routines'>('roster');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [shared, setShared] = useState<Sharing.SharePayload[]>([]);
  const c = useTheme(); const action = useAction();
  const open = (d: Destination, messageId?: string) => { if (d.kind === 'bots') { setSelectedThreads(value => ({ ...value, [d.id]: d.threadId })); onPreferences({ ...prefs, selectedThreads: { ...prefs.selectedThreads, [d.id]: d.threadId } }); } setDestination(d); setAround(messageId); setScreen('chat'); };
  useEffect(() => { if (requested) open(requested); }, [requested]);
  useEffect(() => {
    const checkShared = () => { if (Platform.OS !== 'web' && !isRunningInExpoGo()) setShared(Sharing.getSharedPayloads()); };
    checkShared();
    session.onNotification = ({ notification }) => {
      if (!Notifications) return;
      void Notifications.getPermissionsAsync().then(permission => {
        if (permission.granted) return Notifications.scheduleNotificationAsync({ content: { title: notification.title, body: notification.body, sound: true, data: { ...notification, connectionId: session.client.connection.id } }, trigger: null });
      }).catch(() => {});
    };
    if (AppState.currentState === 'active') session.start();
    const lifecycle = AppState.addEventListener('change', status => { if (status === 'active') { session.start(); checkShared(); } else session.stop(); });
    const responses = Notifications?.addNotificationResponseReceivedListener(({ notification }) => {
      const data = notification.request.content.data;
      if (!data || data.connectionId !== session.client.connection.id || typeof data.threadId !== 'string') return;
      if (typeof data.groupId === 'string') open({ kind: 'groups', id: data.groupId, threadId: data.threadId });
      else if (typeof data.botId === 'string') open({ kind: 'bots', id: data.botId, threadId: data.threadId });
    });
    return () => { session.stop(); lifecycle.remove(); responses?.remove(); session.onNotification = undefined; };
  }, [session]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (screen === 'roster') return false; setScreen(screen === 'chat' || screen === 'routines' ? 'roster' : 'chat'); return true; });
    return () => subscription.remove();
  }, [screen]);
  const insets = useScreenInsets();
  const edgeToEdge = ['roster', 'chat', 'threads', 'profile'].includes(screen);
  const owner = destination?.kind === 'bots' ? state.bots.find(b => b.id === destination.id) : undefined;
  return <SafeAreaView edges={edgeToEdge ? [] : insets.bottom ? ['top', 'bottom'] : ['top']} style={{ flex: 1, backgroundColor: c.bg }}>

    {!!shared.length && <View style={{ padding: 12, gap: 8 }}><Label bold>{shared.length} shared item{shared.length === 1 ? '' : 's'}</Label><Label muted>{destination && screen === 'chat' ? `Add to this conversation on ${session.client.connection.name}, then review and tap Send.` : 'Choose the conversation you want to share with.'}</Label><Row>
      {destination && screen === 'chat' && <Button title="Add to draft" disabled={action.busy} onPress={() => void action.run(async () => {
        const key = destinationKey(destination); const current = drafts[key] ?? { text: '', files: [] }; const files = [...current.files]; const texts = [current.text];
        for (const item of shared) {
          if (item.shareType === 'text' || item.shareType === 'url') texts.push(item.value);
          else files.push(await uploadFile(session.client, item.value, decodeURIComponent(item.value.split('/').pop() ?? 'shared-file'), item.mimeType ?? 'application/octet-stream'));
        }
        setDrafts(d => ({ ...d, [key]: { text: texts.filter(Boolean).join('\n\n'), files } })); Sharing.clearSharedPayloads(); setShared([]);
      })} />}
      <Button title="Discard share" onPress={() => { Sharing.clearSharedPayloads(); setShared([]); }} /></Row><ErrorNotice error={action.error} /></View>}
    {screen === 'roster' && <Roster showThreads={prefs.showThreads !== false} session={session} state={state} selectedThreads={selectedThreads} onOpen={open} onSettings={onSettings} onRoutines={() => setScreen('routines')} />}
    {screen === 'routines' && <Routines session={session} onBack={() => setScreen('roster')} onOpen={open} />}
    {(['chat', 'threads', 'profile'].includes(screen)) && destination && <Chat visible={visible && screen === 'chat'} onSelect={open} prefs={prefs} key={destinationKey(destination)} session={session} state={state} destination={destination} around={around} drafts={drafts} onDraft={(key, draft) => setDrafts(d => ({ ...d, [key]: draft }))} onBack={() => setScreen('roster')} onThreads={() => setScreen('threads')} onProfile={() => setScreen('profile')} onComputer={() => setScreen('computer')} />}
    {screen === 'threads' && destination && <Threads session={session} state={state} destination={destination} onSelect={open} onBack={() => setScreen('chat')} />}
    {screen === 'profile' && destination && owner && <Profile session={session} bot={owner} destination={destination} onBack={() => setScreen('chat')} />}
    {screen === 'computer' && destination && <Computer key={destinationKey(destination)} visible={visible} session={session} state={state} botId={destination.id} threadId={destination.threadId} onBack={() => setScreen('chat')} />}
  </SafeAreaView>;
}

function Root({ onSkin }: { onSkin: (skin: storage.Preferences['skin']) => void }) {
  const [all, setAll] = useState<Connection[]>([]); const [session, setSession] = useState<Session>();
  const [screen, setScreen] = useState<'loading' | 'welcome' | 'unpaired' | 'notifications' | 'pair' | 'settings' | 'app' | 'routines' | 'apps'>('loading');
  const [requested, setRequested] = useState<Destination>();
  const [prefs, setPrefs] = useState<storage.Preferences>();
  const savePrefs = (p: storage.Preferences) => { setPrefs(p); onSkin(p.skin); void storage.savePreferences(p); };
  const [link, setLink] = useState<string>(); const generation = useRef(0); const activeSession = useRef<Session>(undefined);
  const action = useAction(); const c = useTheme(); const insets = useScreenInsets();
  const connect = async (connection: Connection) => {
    const current = ++generation.current; const credential = await storage.token(connection);
    if (current !== generation.current) return;
    if (!credential) throw new Error('This computer needs to be paired again.');
    activeSession.current?.stop();
    const next = new Session(new Client(connection, credential, expoFetch as typeof fetch));
    activeSession.current = next; setSession(next); setScreen('app');
  };
  useEffect(() => {
    void action.run(async () => {
      try {
        const saved = await storage.connections(); setAll(saved); const preferences = await storage.preferences(); setPrefs(preferences); onSkin(preferences.skin);
        const initial = await Linking.getInitialURL();
        if (initial?.startsWith('openmausbot://pair')) { setLink(initial); setScreen('pair'); }
        else if (saved.length && await storage.token(saved[0])) await connect(saved[0]); else setScreen(saved.length ? 'settings' : preferences.welcomeSeen ? 'unpaired' : 'welcome');
      } catch (error) { setScreen('settings'); throw error; }
    });
    const listener = Linking.addEventListener('url', ({ url }) => { if (url.startsWith('openmausbot://pair')) { setLink(url); setScreen('pair'); } });
    return () => { generation.current++; activeSession.current?.stop(); listener.remove(); };
  }, []);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (screen === 'app' || screen === 'unpaired' || screen === 'welcome') return false; if (screen === 'loading') return true; setScreen(screen === 'routines' || screen === 'apps' ? 'settings' : session ? 'app' : 'unpaired'); return true; }); return () => sub.remove(); }, [screen, session]);
  return <View style={{ flex: 1, backgroundColor: c.bg }}><StatusBar barStyle={c.dark ? 'light-content' : 'dark-content'} />
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <SafeAreaView edges={screen === 'app' ? ['left', 'right'] : insets.bottom ? ['top', 'bottom', 'left', 'right'] : ['top', 'left', 'right']} style={{ flex: 1 }}>
    <ErrorNotice error={action.error} />
    {screen === 'loading' && <Loading />}
    {session && prefs && <View style={{ flex: 1, display: screen === 'app' ? 'flex' : 'none' }}><Workspace visible={screen === 'app'} prefs={prefs} onPreferences={savePrefs} requested={requested} key={session.client.connection.id} session={session} onSettings={() => setScreen('settings')} /></View>}
    {(screen === 'welcome' || screen === 'unpaired') && prefs && <Onboarding mode={screen} onConnect={() => { savePrefs({ ...prefs, welcomeSeen: true }); setScreen('pair'); }} onSkip={screen === 'welcome' ? () => { savePrefs({ ...prefs, welcomeSeen: true }); setScreen(session ? 'app' : 'unpaired'); } : undefined} onSettings={() => setScreen('settings')} />}
    {screen === 'notifications' && prefs && <Onboarding mode="notifications" busy={action.busy} onConnect={() => void action.run(async () => { await Notifications?.requestPermissionsAsync(); savePrefs({ ...prefs, notificationsSeen: true }); setScreen('app'); })} onSkip={() => { savePrefs({ ...prefs, notificationsSeen: true }); setScreen('app'); }} />}
    {screen === 'pair' && <Pairing initialLink={link} onCancel={() => { setLink(undefined); setScreen(all.length ? 'settings' : 'unpaired'); }} onPaired={async (connection, credential) => { await storage.save(connection, credential); setAll(await storage.connections()); setLink(undefined); await connect(connection); if (prefs && !prefs.notificationsSeen) setScreen('notifications'); }} />}
    {screen === 'apps' && session && <ConnectedApps session={session} onBack={() => setScreen('settings')} />}
    {screen === 'routines' && session && <Routines session={session} onBack={() => setScreen('settings')} onOpen={d => { setRequested(d); setScreen('app'); }} />}
    {screen === 'settings' && prefs && <Settings onWelcome={() => setScreen('welcome')} session={session} all={all} prefs={prefs} onPreferences={savePrefs} onBack={() => setScreen(session ? 'app' : 'unpaired')} onPair={() => { setLink(undefined); setScreen('pair'); }} onUse={connect} onEdit={async connection => { const token = await storage.token(connection); if (!token) throw new Error('Pair this computer again.'); await storage.save(connection, token); setAll(await storage.connections()); await connect(connection); setScreen('settings'); }} onForget={async connection => { await storage.forget(connection); setAll(await storage.connections()); if (session?.client.connection.id === connection.id) { session.stop(); activeSession.current = undefined; setSession(undefined); } }} onRoutines={session ? () => setScreen('routines') : undefined} onApps={session ? () => setScreen('apps') : undefined} />}

  </SafeAreaView></KeyboardAvoidingView></View>;
}

export default function App() { const [skin, setSkin] = useState<storage.Preferences['skin']>('system'); return <SafeAreaProvider><ThemeProvider skin={skin}><Root onSkin={setSkin} /></ThemeProvider></SafeAreaProvider>; }

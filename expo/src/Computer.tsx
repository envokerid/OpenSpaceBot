import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Pressable, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from './core/session';
import type { State } from './core/store';
import { routeId } from './core/client';
import { captureComputer, computerPreview } from './core/computer';
import { useAuthenticatedImage } from './images';
import { Icon } from './Icon';
import { Button, ErrorNotice, Label, Row, useAction } from './ui';

export function Computer({ session, state, botId, threadId, visible = true, onBack }: {
 session: Session; state: State; botId: string; threadId: string; visible?: boolean; onBack: () => void;
}) {
 const action = useAction();
 const { bot, busy, cloud, live, savedPath } = computerPreview(state, botId, threadId);
 const [foreground, setForeground] = useState(AppState.currentState === 'active');
 const [attempt, setAttempt] = useState(0);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string>();
 const [resolvedSurface, setResolvedSurface] = useState<string>();
 const [capture, setCapture] = useState<string>();
 const [failedImage, setFailedImage] = useState<string>();
 const active = visible && foreground;
 const saved = useAuthenticatedImage(session.client, active && !live && !capture ? savedPath : undefined, attempt);
 const uri = capture ?? saved.uri;
 useEffect(() => { if (live) { setCapture(`data:${live.mime};base64,${live.png}`); setFailedImage(undefined); } }, [live]);
 useEffect(() => {
  const subscription = AppState.addEventListener('change', value => setForeground(value === 'active'));
  return () => subscription.remove();
 }, []);
 useEffect(() => {
  session.setScreens(active);
  return () => session.setScreens(false);
 }, [session, active]);
 useEffect(() => {
  if (!active) return;
  let alive = true;
  setError(undefined);
  // Opening the panel must hydrate this phone's selected thread, even when
  // the desktop is on a sibling and no further live frames will arrive.
  void session.load(threadId).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'Could not load the computer preview.'); });
  return () => { alive = false; };
 }, [session, threadId, active, attempt]);
 useEffect(() => {
  if (!active) return;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
   try {
    const next = await captureComputer(session.client, botId, threadId, controller.signal);
    if (!controller.signal.aborted) { setResolvedSurface(next.surface); if (next.uri) setCapture(next.uri); setError(undefined); }
   } catch (reason) {
    if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not refresh the computer screen.');
   } finally {
    if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(() => void refresh(), 6000); }
   }
  };
  setLoading(true); void refresh();
  return () => { controller.abort(); clearTimeout(timer); };
 }, [session, botId, threadId, active, attempt]);
 const imageError = uri && failedImage === uri ? 'Could not display the screen image.' : saved.failed ? 'Could not load the saved screen image.' : undefined;
 const problem = state.status === 'offline' || state.status === 'revoked' ? state.error ?? 'Connection lost.' : error ?? imageError;
 const retry = () => { setFailedImage(undefined); setAttempt(value => value + 1); if (state.status !== 'connected') session.start(); };
 return <View style={{ flex: 1, backgroundColor: '#000' }}>
  <Row style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 10 }}>
   <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF2E', alignItems: 'center', justifyContent: 'center' }}><Icon name="back" color="#FFFFFF" size={20} /></Pressable>
   <Label size={17} bold style={{ flex: 1, color: '#FFFFFF' }}>{bot?.name}</Label>
   <Label size={13} style={{ color: '#FFFFFFB3' }}>{uri ? live && busy ? 'Live preview' : capture ? 'Preview' : 'Last capture' : busy ? 'Working' : 'Idle'}</Label>
  </Row>
  <View style={{ flex: 1, minHeight: 0 }}>
   {uri && !imageError ? <Image key={`${uri}-${attempt}`} accessibilityLabel={`${bot?.name}'s computer`} source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" onError={() => setFailedImage(uri)} /> : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 12 }}>
    {loading && !problem && <ActivityIndicator size={24} color="#FFFFFF" />}
    <Label size={15} style={{ color: '#FFFFFFB3', textAlign: 'center' }}>{problem ?? (loading ? 'Loading computer…' : busy ? 'Waiting for a screen capture…' : 'No screen capture yet')}</Label>
    {!loading && !problem && <Label size={13} style={{ color: '#FFFFFF73', textAlign: 'center' }}>A preview appears when this conversation uses its computer or browser.</Label>}
   </View>}
  </View>
  {problem && <View style={{ padding: 12, gap: 8 }}>{uri && !imageError && <Label size={13} style={{ color: '#FFFFFFB3' }}>{problem}</Label>}<Button title="Retry preview" onPress={retry} /></View>}
  {(resolvedSurface ? resolvedSurface === 'cloud' : cloud) && bot?.cloudBackend !== 'vps' && <View style={{ paddingHorizontal: 18, paddingVertical: 12, gap: 8 }}>
   <ErrorNotice error={action.error} />
   <Button title="Open live cloud desktop" primary disabled={action.busy} onPress={() => Alert.alert('Open live cloud desktop?', 'This gives this phone full control of the cloud computer, including anything signed in inside it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Open', onPress: () => void action.run(async () => {
    const result = await session.client.request<{ joinUrl: string }>(`/api/bots/${routeId(botId)}/computer/join?threadId=${routeId(threadId)}`, 'POST', {});
    const url = new URL(result.joinUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The computer returned an invalid viewer URL.');
    await WebBrowser.openBrowserAsync(url.toString());
   }) }])} />
   <Label size={12} style={{ textAlign: 'center', color: '#999999' }}>Live cloud access must be enabled for this phone in the computer's Phone settings.</Label>
  </View>}
 </View>;
}

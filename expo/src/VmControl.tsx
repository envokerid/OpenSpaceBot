import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import type { Client } from './core/client';
import { captureVmFrame, computerPoint, vmControl, type MobileVmInput } from './core/computer';
import { createVmGestures } from './core/vmGestures';
import { createVmPreview, type PreviewState } from './core/vmPreview';
import { Button, Label, Row } from './ui';

export function VmControl({ client, botId, threadId, onClose }: { client: Client; botId: string; threadId: string; onClose: () => void }) {
 const [lease] = useState(() => Crypto.randomUUID());
 const [held, setHeld] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string>();
 const [frameError, setFrameError] = useState<string>();
 const [preview, setPreview] = useState<PreviewState>({ frames: [], width: 0, height: 0 });
 const [text, setText] = useState('');
 const [size, setSize] = useState({ width: 0, height: 0 });
 const frameSize = preview;
 const sendGesture = useRef<(input: MobileVmInput) => void>(() => {});
 const [gestures] = useState(() => createVmGestures(input => sendGesture.current(input)));
 const state = useRef({ alive: true, closing: false, input: false });
 const pending = useRef<Promise<unknown>>(Promise.resolve());
 const stream = useRef<ReturnType<typeof createVmPreview> | undefined>(undefined);
 const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Could not control the VM.';
 useEffect(() => {
  const life = state.current;
  life.alive = true; life.closing = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  const frames = createVmPreview({
   capture: async signal => (await captureVmFrame(client, botId, threadId, signal)).uri,
   changed: value => { if (!disposed && !life.closing) setPreview(value); },
   error: reason => { if (!disposed && !life.closing) setFrameError(reason === undefined ? undefined : message(reason)); },
  });
  stream.current = frames;
  setPreview({ frames: [], width: 0, height: 0 });
  const take = vmControl(client, botId, threadId, lease, 'take');
  pending.current = take;
  void take.then(() => {
   if (disposed || !life.alive || life.closing) return;
   setHeld(true); frames.refresh();
   heartbeat = setInterval(() => {
    if (life.closing) return;
    void vmControl(client, botId, threadId, lease, 'renew').catch(reason => {
     if (!disposed && life.alive) { frames.stop(); setHeld(false); setError(message(reason)); clearInterval(heartbeat); void vmControl(client, botId, threadId, lease, 'release').catch(() => {}); }
    });
   }, 15_000);
  }).catch(reason => { if (!disposed && life.alive) setError(message(reason)); });
  return () => {
   gestures.cancel();
   disposed = true; life.alive = false; life.closing = true; frames.stop(); clearInterval(heartbeat);
   void pending.current.catch(() => {}).then(() => vmControl(client, botId, threadId, lease, 'release')).catch(() => {});
  };
 }, [client, botId, threadId, lease, gestures]);
 const close = async () => {
  if (state.current.closing) return;
  gestures.cancel();
  stream.current?.stop();
  state.current.closing = true; setBusy(true); setHeld(false);
  await pending.current.catch(() => {});
  try { await vmControl(client, botId, threadId, lease, 'release'); onClose(); }
  catch (reason) { if (state.current.alive) { setBusy(false); setError(`${message(reason)} Control expires automatically about a minute after disconnecting.`); } }
 };
 useEffect(() => {
  const subscription = AppState.addEventListener('change', value => { if (value !== 'active') void close(); });
  return () => subscription.remove();
 });
 const send = async (input: MobileVmInput) => {
  if (!held || preview.visible === undefined || frameError || state.current.input || state.current.closing) return;
  state.current.input = true; setBusy(true); setError(undefined);
  const operation = vmControl(client, botId, threadId, lease, 'input', input);
  pending.current = operation;
  try { await operation; if (input.type === 'text' && state.current.alive) setText(''); stream.current?.refresh(); }
  catch (reason) { if (state.current.alive) setError(message(reason)); }
  finally { state.current.input = false; if (state.current.alive && !state.current.closing) setBusy(false); }
 };
 sendGesture.current = input => { void send(input); };
 useEffect(() => { gestures.cancel(); }, [gestures, held, busy, frameError, size.width, size.height, frameSize.width, frameSize.height]);
 const point = (x: number, y: number) => {
  const desktop = computerPoint(x, y, size.width, size.height, frameSize.width, frameSize.height);
  return desktop ? { local: { x, y }, desktop } : undefined;
 };
 const previewStream = stream.current;
 return <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}><KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
  <Row style={{ padding: 10 }}><Label style={{ flex: 1, color: '#fff' }} bold>{held ? 'You control the VM' : 'VM control'}</Label><Button title={held ? "Return to bot" : "Back"} disabled={busy} onPress={() => { if (held) void close(); else onClose(); }} /></Row>
  <View style={{ flex: 1, minHeight: 100 }} onLayout={event => setSize(event.nativeEvent.layout)}
   onStartShouldSetResponder={() => held && !busy && !frameError && frameSize.width > 0 && !state.current.closing}
   onResponderGrant={event => {
    if (event.nativeEvent.touches.length !== 1) { gestures.cancel(); return; }
    gestures.begin(point(event.nativeEvent.locationX, event.nativeEvent.locationY));
   }}
   onResponderStart={event => { if (event.nativeEvent.touches.length !== 1) gestures.cancel(); }}
   onResponderMove={event => {
    if (event.nativeEvent.touches.length !== 1) { gestures.cancel(); return; }
    gestures.move(point(event.nativeEvent.locationX, event.nativeEvent.locationY));
   }}
   onResponderRelease={event => {
    gestures.end(point(event.nativeEvent.locationX, event.nativeEvent.locationY));
   }} onResponderTerminate={() => gestures.cancel()}>
   {preview.visible === undefined && <Label style={{ color: '#fff', textAlign: 'center', padding: 30 }}>{error ? 'VM unavailable' : 'Connecting to VM…'}</Label>}
   <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
    {preview.frames.map(frame => <Image key={frame.id} source={{ uri: frame.uri }} resizeMode="contain" fadeDuration={0}
     style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: preview.visible === frame.id ? 1 : 0 }}
     accessible={preview.visible === frame.id} accessibilityLabel="Interactive VM desktop"
     onLoad={event => previewStream?.loaded(frame.id, event.nativeEvent.source.width, event.nativeEvent.source.height)}
     onError={() => previewStream?.failed(frame.id)} />)}
   </View>
  </View>
  {(error || frameError) && <Label size={13} style={{ color: '#ffb4b4', padding: 10 }} accessibilityRole="alert">{error ?? frameError}</Label>}
  <Label size={12} style={{ color: '#bbb', paddingHorizontal: 12 }}>Tap to click, double-tap to double-click, or hold to right-click. Swipe down to scroll up; swipe up to scroll down.</Label>
  <View style={{ padding: 10, gap: 8 }}>
   <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
    {(['Return', 'Tab', 'Escape', 'BackSpace', 'Up', 'Down', 'Left', 'Right'] as const).map(key => <Button key={key} title={key === 'Return' ? 'Enter' : key === 'BackSpace' ? 'Backspace' : key} disabled={!held || busy || !!frameError} onPress={() => void send({ type: 'key', key })} />)}
    {(['a', 'c', 'v', 'z'] as const).map(key => <Button key={key} title={`Ctrl+${key.toUpperCase()}`} disabled={!held || busy || !!frameError} onPress={() => void send({ type: 'key', key, modifiers: ['ctrl'] })} />)}
   </ScrollView>
   <Row style={{ gap: 8 }}><TextInput accessibilityLabel="Text to type in VM" placeholder="Type in VM…" placeholderTextColor="#999" value={text} onChangeText={setText} maxLength={4096} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: '#fff', backgroundColor: '#222', padding: 12, borderRadius: 8 }} editable={held && !busy} onSubmitEditing={() => { if (text) void send({ type: 'text', text }); }} /><Pressable accessibilityRole="button" accessibilityLabel="Send text to VM" disabled={!held || busy || !!frameError || !text} onPress={() => void send({ type: 'text', text })} style={{ padding: 12, opacity: !held || busy || !!frameError || !text ? 0.4 : 1 }}><Label style={{ color: '#fff' }} bold>Send</Label></Pressable></Row>
  </View>
 </KeyboardAvoidingView></SafeAreaView>;
}

import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
// Keep the package's eager native imports out of Expo Go, including Fast Refresh.
const speech: typeof import('expo-speech-recognition') | undefined =
  !isRunningInExpoGo() && requireOptionalNativeModule('ExpoSpeechRecognition')
    ? require('expo-speech-recognition')
    : undefined;
interface DictationProps { text: string; onText: (text: string) => void; disabled: boolean; color?: string; surface?: string }
export function Dictation(props: DictationProps) {
  return speech ? <NativeDictation {...props} /> : <IconButton icon="mic" size={32} color={props.color} surface={props.surface} label="Start dictation" onPress={() => Alert.alert('Dictation', 'Dictation is available in the OpenMausBot development build.')} />;
}
import { IconButton, ErrorNotice, Row, useTheme } from './ui';

function NativeDictation({ text, onText, disabled, color, surface }: DictationProps) {
  const { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } = speech!;
  const c = useTheme(); const [listening, setListening] = useState(false); const [error, setError] = useState<string>();
  const prefix = useRef(''); const active = useRef(false);
  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => { active.current = false; setListening(false); });
  useSpeechRecognitionEvent('error', event => { active.current = false; setListening(false); if (event.error !== 'aborted') setError(event.message); });
  useSpeechRecognitionEvent('result', event => {
    if (!active.current) return;
    const transcript = event.results[0]?.transcript ?? '';
    // Interim results replace the current spoken phrase, never append it.
    onText([prefix.current, transcript].filter(Boolean).join(' '));
  });
  useEffect(() => {
    const stop = () => { active.current = false; ExpoSpeechRecognitionModule.abort(); setListening(false); };
    const sub = AppState.addEventListener('change', status => { if (status !== 'active') stop(); });
    return () => { sub.remove(); active.current = false; ExpoSpeechRecognitionModule.abort(); };
  }, []);
  useEffect(() => { if (disabled && active.current) { active.current = false; ExpoSpeechRecognitionModule.abort(); } }, [disabled]);
  return <Row><IconButton icon="mic" size={32} color={color} surface={surface ?? c.muted + '20'} elevation={0} label={listening ? 'Stop dictation' : 'Start dictation'} disabled={disabled && !listening} onPress={() => {
    if (listening) { ExpoSpeechRecognitionModule.stop(); return; }
    setError(undefined);
    void ExpoSpeechRecognitionModule.requestPermissionsAsync().then(result => {
      if (!result.granted) throw new Error('Allow microphone and speech access in device settings.');
      prefix.current = text.trimEnd(); active.current = true;
      ExpoSpeechRecognitionModule.start({ lang: Intl.DateTimeFormat().resolvedOptions().locale, interimResults: true, continuous: false, requiresOnDeviceRecognition: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition() });
    }).catch(e => { active.current = false; setError(e instanceof Error ? e.message : 'Could not start dictation.'); });
  }} /><ErrorNotice error={error} /></Row>;
}

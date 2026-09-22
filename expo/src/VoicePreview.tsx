import React from 'react';
import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { useAudioPlayer } from 'expo-audio';
import type { Client } from './core/client';
import { ActionRow, ErrorNotice, useAction } from './ui';
export function VoicePreview({ client, name, voice }: { client: Client; name: string; voice: string }) {
 const player = useAudioPlayer(); const action = useAction();
 return <><ActionRow title="Preview voice" icon="volume" disabled={action.busy} onPress={() => void action.run(async () => {
   const response = await client.response('/api/tts/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `Hi, I'm ${name}.`, voiceId: voice }) });
   const file = new File(Paths.cache,`voice-${randomUUID()}.mp3`); file.write(new Uint8Array(await response.arrayBuffer())); player.replace({ uri: file.uri }); player.play();
 })} /><ErrorNotice error={action.error} /></>;
}

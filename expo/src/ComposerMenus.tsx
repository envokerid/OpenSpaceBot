import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { IconButton, Label, Row, useTheme } from './ui';

export function ComposerMenu({ name, bot, onClose, onChoose }: { name: string; bot: boolean; onClose: () => void; onChoose: (id: string) => void }) {
 const c = useTheme(); const insets = useSafeAreaInsets();
 const items: [string, IconName, string, string][] = [['photo','photo','Photo Library','Add a photo to this message'],['file','attach','Choose File','Add a document from Files'],['new','add','New thread',`Start a fresh thread with ${name}`],['threads','list','Threads','Switch, rename or remove one'], ...(bot ? [['profile','settings','Bot settings','Model, profile, voice and notifications'],['computer','computer','Watch computer',`Live view of what ${name} is doing`]] as [string, IconName, string, string][] : []),['md','share','Share transcript','This thread as Markdown'],['json','share','Share as JSON','Structured transcript data']];
 return <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}><View style={{ flex: 1, backgroundColor: '#00000052', paddingTop: insets.top, paddingBottom: insets.bottom + 70, justifyContent: 'flex-end' }}><Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', inset: 0 }} /><ScrollView style={{ flexGrow: 0, marginLeft: 12, marginRight: 44, borderRadius: 28, backgroundColor: c.chrome, maxHeight: '92%', elevation: 8 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}>{items.map(([id,icon,title,subtitle]) => <Pressable key={id} accessibilityRole="button" onPress={() => onChoose(id)} style={{ minHeight: 64, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 16 }}><View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.muted+'20', justifyContent: 'center', alignItems: 'center' }}><Icon name={icon} size={22} color={c.text} /></View><View style={{ flex: 1, gap: 2 }}><Label size={17} bold>{title}</Label><Label size={13} muted>{subtitle}</Label></View></Pressable>)}</ScrollView></View></Modal>;
}
const commands = [
 ['computer','/computer','Open live screen & desktop controls','#007AFF',''],
 ['threads','/threads','View and manage threads','#AF52DE',''],
 ['diff','/diff','Inspect latest git changes and patches','#34C759','Show git diff and list modified files'],
 ['retry','/retry','Retry the last turn with fresh context','#FF9500','Please retry the last turn'],
 ['steer','/steer','Steer and redirect active execution','#FF2D55','Pause and explain your current plan'],
];
export function CommandHUD({ draft, bot, onClose, onChoose }: { draft: string; bot: boolean; onClose: () => void; onChoose: (id: string, prompt: string) => void }) {
 const c = useTheme(); const query = draft.startsWith('/') ? draft.slice(1).toLowerCase() : '';
 return <View style={{ marginHorizontal: 12, backgroundColor: c.chrome, borderRadius: 20, paddingBottom: 8, gap: 4, elevation: 6 }}><Row style={{ paddingLeft: 14, paddingTop: 4, gap: 0 }}><Label size={11} bold muted style={{ flex: 1 }}>SLASH COMMANDS</Label><IconButton icon="close" label="Close slash commands" chrome={false} glyph={18} onPress={onClose} /></Row><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, gap: 8 }}>{commands.filter(([id,title,desc]) => (bot || id !== 'computer') && `${title} ${desc}`.toLowerCase().includes(query)).map(([id,title,description,color,prompt]) => <Pressable key={id} onPress={() => onChoose(id,prompt)} style={{ width: 168, minHeight: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: c.muted+'12', flexDirection: 'row' }}><View style={{ width: 3, backgroundColor: color }} /><View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, gap: 3 }}><Label size={13} bold>{title}</Label><Label size={11} muted numberOfLines={2}>{description}</Label></View></Pressable>)}</ScrollView></View>;
}

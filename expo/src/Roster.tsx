import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import type { Session } from './core/session';
import { visibleMessages, type State } from './core/store';
import { transcriptRows } from './core/transcript';
import type { Bot, Destination, SearchHit } from './core/types';
import { canAdminister } from './core/types';
import { Button, ErrorNotice, IconButton, Label, Row, Sheet, useAction, useTheme } from './ui';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { RosterGroupRow } from './RosterGroupRow';
import { NewGroupSheet } from './NewGroupSheet';
import { useScreenInsets } from './useScreenInsets';
import { AddRosterSheet } from './AddRosterSheet';
import { RosterBotActions } from './RosterBotActions';
import { RosterGroupActions } from './RosterGroupActions';
import { RosterBotPressable } from './RosterBotPressable';
import { messageDay } from '../../shared/message-day';
import { UnreadLight } from './UnreadLight';
import { RosterHydration } from './RosterHydration';

export function Roster({ showThreads = true, session, state, selectedThreads, onOpen, onSettings }: { showThreads?: boolean; session: Session; state: State; selectedThreads: Record<string, string>; onOpen: (d: Destination, messageId?: string) => void; onSettings: () => void; onRoutines: () => void }) {
 const insets = useScreenInsets();
 const [now, setNow] = useState(Date.now);
 useEffect(() => {
  let timer: ReturnType<typeof setTimeout>;
  const update = () => {
   clearTimeout(timer);
   const current = new Date(); setNow(current.getTime());
   const midnight = new Date(current); midnight.setHours(24, 0, 0, 0);
   timer = setTimeout(update, midnight.getTime() - current.getTime() + 50);
  };
  update();
  const subscription = AppState.addEventListener('change', status => { if (status === 'active') update(); });
  return () => { clearTimeout(timer); subscription.remove(); };
 }, []);
 const c = useTheme(); const [query, setQuery] = useState(''); const [searching, setSearching] = useState(false); const [updates, setUpdates] = useState(false);
 const [adding, setAdding] = useState(false);
 const [botMenu, setBotMenu] = useState<{ id: string; x: number; y: number }>();
 const menuBot = state.bots.find(bot => bot.id === botMenu?.id && !bot.hidden);
 const [groupMenu, setGroupMenu] = useState<{ id: string; x: number; y: number }>();
 const menuGroup = state.groups.find(group => group.id === groupMenu?.id && !group.dm);
 const [hits, setHits] = useState<SearchHit[]>([]); const [create, setCreate] = useState<'group'>();
 const action = useAction(); const admin = canAdminister(session.client.connection);
 const bots = state.bots.filter(b => !b.hidden && (!query || `${b.name} ${b.title} ${b.section ?? ''} ${b.tasks?.map(t => t.title).join(' ')} ${b.projects?.map(p => p.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())));
 const sections = [...new Set(bots.map(b => b.section ?? ''))];
 const attention = state.bots.flatMap(bot => (bot.tasks ?? []).filter(t => t.activity === 'waiting-on-you' || t.activity === 'working' || t.unread || state.queues[t.threadId]?.length).map(task => ({ bot, task })));
 useEffect(() => { let current = true; setHits([]); if (query.trim().length < 2) return; const timer = setTimeout(() => { void session.client.search(query).then(r => { if (current) setHits(r.hits); }).catch(() => {}); }, 350); return () => { current = false; clearTimeout(timer); }; }, [query, session]);
 const openBot = (bot: Bot, threadId?: string) => onOpen({ kind: 'bots', id: bot.id, threadId: threadId ?? (bot.tasks?.some(t => t.threadId === selectedThreads[bot.id]) ? selectedThreads[bot.id] : bot.threadId) });
 const heading = (title: string) => <Label size={13} bold muted style={{ paddingHorizontal: 20, letterSpacing: 0.4 }}>{title}</Label>;
 const groupItems = state.groups.filter(g => !g.dm && g.name.toLowerCase().includes(query.toLowerCase())).map(group => <RosterGroupRow key={group.id} group={group}
   bots={group.memberIds.flatMap(id => { const bot = state.bots.find(b => b.id === id); return bot ? [bot] : []; })}
   client={session.client} now={now}
   last={transcriptRows(state.pages[group.threadId] ? visibleMessages(state.pages[group.threadId]) : group.messages ?? [], 'off', true).at(-1)}
   onMenu={admin ? anchor => setGroupMenu({ id: group.id, ...anchor }) : undefined}
   onPress={() => onOpen({ kind: 'groups', id: group.id, threadId: group.threadId })} />);
 return <View style={{ flex: 1 }}>
 <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 4, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}><Pressable accessibilityRole="button" accessibilityLabel="Profile settings" onPress={onSettings} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 44, height: 44, borderRadius: 22, elevation: 3, backgroundColor: c.chrome, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Label size={13} bold style={{ color: '#FFFFFF' }}>{session.client.connection.name.slice(0, 1).toUpperCase()}</Label></View></View></Pressable></View>
 {state.status !== 'connected' && (state.hydrated || state.status !== 'connecting') && <View style={{ alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 4 }}><Label size={13} style={{ color: state.status === 'connecting' ? c.muted : state.status === 'revoked' ? c.danger : '#E78531', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.muted+'1F', borderRadius: 30 }}>{state.status === 'connecting' ? 'Connecting…' : state.status === 'revoked' ? 'This phone was unpaired on the computer.' : state.error ?? 'Offline. Retrying…'}</Label></View>}
 <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} refreshControl={<RefreshControl refreshing={action.busy} onRefresh={() => void action.run(() => session.refresh())} tintColor={c.accent} />}>
 <ErrorNotice error={action.error} />
 <RosterHydration ready={state.hydrated} connecting={state.status === 'connecting'}>
 {showThreads && !query && !!attention.length && <View style={{ gap: 12, paddingTop: 2, marginBottom: 10 }}>{heading('NEEDS ATTENTION')}{attention.map(({ bot, task }) => <Pressable key={task.threadId} onPress={() => openBot(bot, task.threadId)} style={{ paddingHorizontal: 20, paddingBottom: 4 }}><Label bold>{task.title || 'Thread'}</Label><Label size={13} muted>{bot.name} · {task.activity === 'waiting-on-you' ? 'Waiting on you' : task.activity === 'working' ? 'Working' : 'Unread'}</Label></Pressable>)}</View>}
 {!!groupItems.length && <View>{!query && heading('GROUPS')}{groupItems}</View>}
 {sections.map(section => <View key={section}>{!query && <View style={{ paddingTop: 18, paddingBottom: 4 }}>{heading(section ? section.toUpperCase() : 'BOTS')}</View>}{bots.filter(b => (b.section ?? '') === section).map(bot => {
 const last = transcriptRows(state.pages[bot.threadId] ? visibleMessages(state.pages[bot.threadId]) : bot.messages ?? []).at(-1);
 return <RosterBotPressable key={bot.id} name={bot.name} onPress={() => openBot(bot)}
  onMenu={admin ? anchor => setBotMenu({ id: bot.id, ...anchor }) : undefined}><View style={{ width: 10, alignItems: 'center', paddingTop: 34 }}>{bot.unread && <UnreadLight />}</View><View style={{ paddingTop: 12, marginRight: 14 }}><Avatar bot={bot} client={session.client} /></View><View style={{ flex: 1, paddingVertical: 12, gap: 4 }}><Row style={{ flexWrap: 'nowrap', gap: 6 }}><Label size={17} bold numberOfLines={1} style={{ flex: 1 }}>{bot.name}</Label><Label size={15} muted>{last ? messageDay(last.at, now) : ''}</Label><Icon name="chevron" size={16} color={c.muted + '80'} /></Row>{!!bot.title && <Label size={13} muted style={{ alignSelf: 'flex-start', borderRadius: 12, backgroundColor: c.muted + '26', paddingHorizontal: 8, paddingVertical: 3 }}>{bot.title}</Label>}<Row style={{ gap: 8, flexWrap: 'nowrap' }}><Label size={15} muted numberOfLines={1} style={{ flex: 1 }}>{last?.card?.subtitle || last?.card?.title || last?.text || `Hi, I'm ${bot.name}. What would you like me to do?`}</Label>{bot.busy && <ActivityIndicator size={12} color={c.accent} />}</Row>{bot.tasks?.some(t => t.threadId === bot.threadId && t.activity === 'waiting-on-you') && <Row style={{ alignSelf: 'flex-start', marginTop: 4, backgroundColor: bot.color === 'blue' ? c.mine : c.accent, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, gap: 4 }}><Icon name="bell" size={12} color="#FFFFFF" /><Label size={12} bold style={{ color: '#FFFFFF', letterSpacing: 0 }}>Waiting on you</Label></Row>}</View></RosterBotPressable>;
 })}</View>)}
 {!!hits.length && <View style={{ marginTop: 20 }}>{heading('MESSAGES')}{hits.map(hit => <Pressable key={hit.messageId} style={{ padding: 20, gap: 4, borderBottomWidth: 0.5, borderColor: c.line }} onPress={() => { const bot = state.bots.find(b => b.id === hit.botId || b.tasks?.some(t => t.threadId === hit.threadId)); const group = state.groups.find(g => g.id === hit.groupId || g.threadId === hit.threadId); if (bot) onOpen({ kind: 'bots', id: bot.id, threadId: hit.threadId }, hit.messageId); else if (group) onOpen({ kind: 'groups', id: group.id, threadId: hit.threadId }, hit.messageId); }}><Label numberOfLines={3}>{hit.snippet ?? hit.text}</Label></Pressable>)}</View>}
 </RosterHydration>
 </ScrollView>
 <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 8, gap: 8, flexDirection: 'row', alignItems: 'center' }}>{searching ? <><View style={{ flex: 1, height: 52, borderRadius: 26, backgroundColor: c.chrome, elevation: 3, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}><Icon name="search" size={18} color={c.muted} /><TextInput autoFocus accessibilityLabel="Search threads" placeholder="Search threads" placeholderTextColor={c.muted} value={query} onChangeText={setQuery} style={{ flex: 1, color: c.text, fontSize: 17 }} />{!!query && <IconButton icon="close" label="Clear search" chrome={false} onPress={() => setQuery('')} />}</View><Button title="Cancel" text style={{ height: 52, backgroundColor: c.chrome, paddingHorizontal: 16, elevation: 3 }} onPress={() => { setSearching(false); setQuery(''); }} /></> : <><Pressable accessibilityRole="button" accessibilityLabel="Updates" disabled={!state.hydrated} onPress={() => setUpdates(true)} style={{ flex: 1, height: 52, backgroundColor: c.chrome, elevation: 3, borderRadius: 26, flexDirection: 'row', alignItems: 'center', paddingLeft: 7, paddingRight: 12, gap: 8 }}><View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>{attention.length ? <Avatar bot={{ ...attention[0].bot, avatarCrop: 'mascot', mascotBody: 'cursor' }} client={session.client} size={30} /> : <Icon name="check" size={20} color={c.muted} />}</View><View style={{ flex: 1 }}><Label numberOfLines={1} size={13} bold>{attention.length ? `${attention[0].bot.name} ${attention[0].task.activity === 'waiting-on-you' ? 'needs you' : attention[0].task.activity === 'working' ? 'is working' : 'has an update'}` : state.hydrated ? 'All caught up' : 'Loading your workspace…'}</Label>{attention.length > 1 && <Label size={13} muted>{`${attention.length - 1} more update${attention.length > 2 ? 's' : ''}`}</Label>}</View><Icon name="up" size={16} color={c.muted} /></Pressable><IconButton icon="search" label="Search" size={48} disabled={!state.hydrated} onPress={() => setSearching(true)} /><Button title="Add" primary disabled={!admin || !state.hydrated || action.busy} style={{ height: 48 }} onPress={() => setAdding(true)} /></>}</View>
 {botMenu && menuBot && admin && <RosterBotActions key={menuBot.id} session={session} bot={menuBot} anchor={botMenu}
  sections={[...state.sections, ...state.bots.filter(bot => !bot.hidden).map(bot => bot.section ?? ''), ...state.groups.map(group => group.section ?? '')]}
  threadId={menuBot.tasks?.some(task => task.threadId === selectedThreads[menuBot.id]) ? selectedThreads[menuBot.id] : menuBot.threadId} onClose={() => setBotMenu(undefined)} />}
 {adding && <AddRosterSheet session={session} bots={state.bots} onClose={() => setAdding(false)} onCreated={openBot}
  onCreateGroup={() => { setAdding(false); setCreate('group'); }} />}
 {groupMenu && menuGroup && admin && <RosterGroupActions key={menuGroup.id} session={session} group={menuGroup} anchor={groupMenu} onClose={() => setGroupMenu(undefined)} />}
 {updates && <Sheet onClose={() => setUpdates(false)}><ScrollView contentContainerStyle={{ paddingBottom: 24 }}><Row style={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: 6 }}><Label size={22} bold style={{ flex: 1, fontWeight: '700', lineHeight: 26 }}>Updates</Label><Label size={13} muted>{attention.length} active</Label></Row>{!attention.length && <View style={{ padding: 24, alignItems: 'center', gap: 6 }}><Label size={20} bold>All caught up</Label><Label muted>Nothing needs your attention right now.</Label></View>}{['waiting-on-you', 'working', 'review'].map(kind => { const items = attention.filter(({ task }) => kind === 'review' ? !['waiting-on-you','working'].includes(task.activity ?? '') : task.activity === kind); return !!items.length && <View key={kind}><Label size={12} bold muted style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 2 }}>{kind === 'waiting-on-you' ? 'NEEDS YOU' : kind === 'working' ? 'WORKING' : 'TO REVIEW'}</Label>{items.map(({ bot, task }) => <Pressable key={task.threadId} onPress={() => { setUpdates(false); openBot(bot,task.threadId); }} style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10, gap: 12 }}><Avatar bot={bot} client={session.client} size={40} /><View style={{ flex: 1, gap: 3 }}><Label size={15} bold>{bot.name}</Label><Label size={12} muted numberOfLines={1}>{task.title}</Label><Label size={14} muted numberOfLines={kind === 'waiting-on-you' ? 3 : 1}>{state.pages[task.threadId]?.messages.at(-1)?.card?.title ?? ' '}</Label></View><Icon name="chevron" size={16} color={c.muted} /></Pressable>)}</View>; })}</ScrollView></Sheet>}

 {create && <NewGroupSheet session={session} bots={state.bots} onClose={() => setCreate(undefined)}
  onCreated={group => onOpen({ kind: 'groups', id: group.id, threadId: group.threadId })} />}
 </View>;
}

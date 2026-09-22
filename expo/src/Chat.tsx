import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import type { Session } from './core/session';
import type { State } from './core/store';
import { transcriptRows, type TranscriptMessage } from './core/transcript';
import { isTyping, visibleMessages } from './core/store';
import type { Destination, Draft } from './core/types';
import { canAdminister, destinationKey } from './core/types';
import { GroupMembers } from './GroupMembers';
import { groupNeedsSetup } from './core/groups';
import { routeId } from './core/client';
import { attachedText, shareResponse, uploadFile } from './attachments';
import { MessageBubble, ActivityRun } from './Messages';
import type { Preferences } from './storage';
import { ComposerMenu, CommandHUD } from './ComposerMenus';
import { LiveBubble } from './LiveBubble';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Dictation } from './Dictation';
import { useChatScroll } from './useChatScroll';
import { useScreenInsets } from './useScreenInsets';
import { BubbleEntrances } from './core/bubbleEntrance';
import { settleSendDraft } from './core/sendDraft';
import { ComposerInput } from './ComposerInput';
import { Button, ErrorNotice, IconButton, Label, Row, useAction, useTheme } from './ui';

export function Chat({ visible, session, state, destination, around, drafts, onDraft, onBack, onThreads, onProfile, onComputer, onSelect, prefs }: {
  visible: boolean; onSelect: (destination: Destination) => void; prefs?: Preferences; session: Session; state: State; destination: Destination; around?: string; drafts: Record<string, Draft>;
  onDraft: (key: string, draft: Draft) => void; onBack: () => void; onThreads: () => void; onProfile: () => void; onComputer: () => void;
}) {
  const c = useTheme(); const action = useAction(); const insets = useScreenInsets();
  const key = destinationKey(destination); const draft = drafts[key] ?? EMPTY_DRAFT;
  const { list, follow, pause, scroll, scrollProps } = useChatScroll<TranscriptMessage>(key, around);
  const latest = useRef(draft);
  const previousDraft = useRef(draft);
  const savedDraft = useRef(draft);
  if (previousDraft.current !== draft) {
    previousDraft.current = draft;
    if (draft !== savedDraft.current) latest.current = draft;
  }
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [draftRevision, setDraftRevision] = useState(0);
  const saveDraft = useRef(onDraft); saveDraft.current = onDraft;
  useEffect(() => () => {
    clearTimeout(draftTimer.current);
    saveDraft.current(key, latest.current);
  }, [key]);
  const sending = useRef(false);
  const [membersOpen, setMembersOpen] = useState(false);
  // Keep resting messages clear of the overlays, including a growing composer.
  const [headerHeight, setHeaderHeight] = useState(80);
  const [footerHeight, setFooterHeight] = useState(88);
  const group = destination.kind === 'groups' ? state.groups.find(g => g.id === destination.id) : undefined;
  const groupBots = group?.memberIds.flatMap(id => {
    const bot = state.bots.find(b => b.id === id);
    return bot ? [bot] : [];
  }) ?? [];
  const setupPending = !!group && groupNeedsSetup(group);
  useEffect(() => { setMembersOpen(false); }, [key, visible]);
  const [more, setMore] = useState(false); const [slash, setSlash] = useState(false);
  const [steeringEngines,setSteeringEngines] = useState<string[]>([]);
  useEffect(() => { let alive = true; void session.client.instances().then(data => { if (alive) setSteeringEngines(data.instances.filter(i => i.capabilities?.queueing).map(i => i.instanceId)); }).catch(() => {}); return () => { alive = false; }; },[session]);
  const owner = destination.kind === 'bots' ? state.bots.find(b => b.id === destination.id) : state.groups.find(g => g.id === destination.id);
  const task = owner?.tasks?.find(t => t.threadId === destination.threadId);
  const busy = task && 'busy' in task ? task.busy : owner && 'working' in owner ? owner.working : false;
  const engineCanSteer = !!owner && 'modelSelection' in owner && steeringEngines.includes(task && 'modelSelection' in task ? task.modelSelection?.instanceId ?? owner.modelSelection.instanceId : owner.modelSelection.instanceId);
  const activeRoom = destination.kind !== 'groups' || owner?.threadId === destination.threadId;
  const page = state.pages[destination.threadId];
  const messages = useMemo(() => transcriptRows(visibleMessages(page), prefs?.activity), [page, prefs?.activity]);
  const entrances = useRef({ key, rows: new BubbleEntrances() });
  if (entrances.current.key !== key) entrances.current = { key, rows: new BubbleEntrances() };
  const entranceRows = entrances.current.rows;
  entranceRows.update(messages.map(message => message.id), !!page);
  const refresh = useCallback(() => session.load(destination.threadId), [session, destination.threadId]);
  useEffect(() => { void action.run(async () => { await session.load(destination.threadId, around ? { around } : {}); await session.client.read(destination); if (!around) scroll(); }); }, [key, around]);
  useEffect(() => { if (!around || !page) return; const index = messages.findIndex(m => m.id === around || m.activityRun?.some(step => step.id === around)); if (index < 0) return; const timer = setTimeout(() => list.current?.scrollToIndex({ index, animated: false, viewPosition: .5 }),150); return () => clearTimeout(timer); },[around,page?.messages.length]);
  const latestMessageId = page?.messages.at(-1)?.id;
  useEffect(() => { if (visible && latestMessageId) void session.client.read(destination).catch(() => {}); },[visible,key,latestMessageId]);
  const persistDraft = (value: Draft) => { savedDraft.current = value; onDraft(key, value); };
  const commitDraft = (value: Draft) => { clearTimeout(draftTimer.current); latest.current = value; setDraftRevision(revision => revision + 1); persistDraft(value); };
  const update = (patch: Partial<Draft>) => commitDraft({ ...latest.current, ...patch });
  const typeText = (text: string) => {
    const before = latest.current.text;
    if (before === text) return;
    latest.current = { ...latest.current, text, sendId: undefined };
    clearTimeout(draftTimer.current);
    // Enable Send and command suggestions immediately; persist ordinary edits
    // after a brief idle instead of rerendering the chat for every character.
    if (!!before.trim() !== !!text.trim() || before.startsWith('/') || text.startsWith('/')) persistDraft(latest.current);
    else draftTimer.current = setTimeout(() => persistDraft(latest.current), 120);
  };
  const send = (prompt?: string) => action.run(async () => {
    if (sending.current || latest.current.sending || !activeRoom || setupPending || state.status === 'revoked') return;
    const captured = prompt ? { ...latest.current, text: prompt, sendId: undefined } : latest.current;
    if (!captured.text.trim() && !captured.files.length) return;
    sending.current = true;
    follow();
    const sendId = captured.sendId ?? randomUUID();
    commitDraft({ ...captured, sendId, sending: true });
    try {
      await session.client.send(destination, attachedText(captured.text, captured.files), sendId);
      commitDraft(settleSendDraft(latest.current, captured, sendId));
      // A refresh failure must not resurrect an already accepted message.
      await refresh().catch(() => {});
      scroll();
    } catch (error) {
      commitDraft(settleSendDraft(latest.current, captured, sendId, true));
      throw error;
    } finally { sending.current = false; }
  });
  const pick = (images: boolean) => action.run(async () => {
    if (images) {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
      if (result.canceled) return;
      const files = [...latest.current.files];
      for (const item of result.assets) { files.push(await uploadFile(session.client, item.uri, item.fileName ?? 'photo.jpg', item.mimeType ?? 'image/jpeg')); commitDraft({ ...latest.current, files: [...files], sendId: undefined }); }
    } else {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const files = [...latest.current.files];
      for (const item of result.assets) { files.push(await uploadFile(session.client, item.uri, item.name, item.mimeType ?? 'application/octet-stream')); commitDraft({ ...latest.current, files: [...files], sendId: undefined }); }
    }
  });
  return <View style={{ flex: 1, backgroundColor: c.bg }}>
    {visible && membersOpen && group && !group.dm && <GroupMembers key={group.id} session={session} group={group} bots={state.bots} onClose={() => setMembersOpen(false)} />}
    <View pointerEvents="box-none" onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)} style={[styles.headerOverlay, { paddingTop: insets.top, paddingBottom: 24 }]}>
      <Svg pointerEvents="none" width="100%" height={headerHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs><LinearGradient id="headerFade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={c.bg} stopOpacity={0.75} /><Stop offset="0.35" stopColor={c.bg} stopOpacity={0.4} /><Stop offset="1" stopColor={c.bg} stopOpacity={0} /></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#headerFade)" />
      </Svg>
      <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 4, gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', height: 48, paddingLeft: 14, paddingRight: 10, gap: 6, borderRadius: 24, backgroundColor: c.chrome, elevation: 3 }}>
          <Icon name="back" size={20} color={c.text} />
          {state.bots.flatMap(b => b.tasks ?? []).some(t => t.unread && t.threadId !== destination.threadId) && <Label size={13} bold style={{ minWidth: 22, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: c.tint, textAlign: 'center' }}>{state.bots.flatMap(b => b.tasks ?? []).filter(t => t.unread && t.threadId !== destination.threadId).length}</Label>}
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          {destination.kind === 'bots' && owner && 'color' in owner ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${owner.name} settings`} onPress={onProfile} style={[styles.identityChip, { backgroundColor: c.chrome }]}>
              <Avatar bot={owner} client={session.client} size={36} />
              <Label size={15} bold numberOfLines={1} style={{ flexShrink: 1 }}>{owner.name}</Label>
            </Pressable>
          ) : groupBots.length ? (
            <ScrollView key={group?.id} horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%', flexGrow: 0 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
              {groupBots.map(bot => <View key={bot.id} style={[styles.identityChip, { backgroundColor: c.chrome, maxWidth: 220 }]}>
                <Avatar bot={bot} client={session.client} size={36} />
                <Label size={15} bold numberOfLines={1} style={{ flexShrink: 1 }}>{bot.name}</Label>
              </View>)}
            </ScrollView>
          ) : (
            <View style={[styles.identityChip, { backgroundColor: c.chrome }]}>
              <Avatar bot={{ name: owner?.name ?? 'Group', color: 'blue' }} client={session.client} size={36} />
              <Label size={15} bold numberOfLines={1} style={{ flexShrink: 1 }}>{owner?.name ?? 'Group'}</Label>
            </View>
          )}
        </View>
        {group && !group.dm && canAdminister(session.client.connection) && <IconButton icon="add" label="Manage members" onPress={() => setMembersOpen(true)} />}
        {destination.kind === 'bots' && <IconButton icon="computer" label={`Watch ${owner?.name}'s computer`} onPress={onComputer} />}
      </View>
      {group && <View style={{ alignSelf: 'center', maxWidth: '90%', marginTop: 4, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12, backgroundColor: c.chrome }}><Label size={13} muted numberOfLines={1}>{group.name}</Label></View>}
    </View>
      <FlatList style={{ flex: 1 }} ref={list} data={messages} keyExtractor={m => m.id} keyboardShouldPersistTaps="handled" {...scrollProps}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: headerHeight + 6, paddingBottom: footerHeight + 12, gap: 6, width: '100%', maxWidth: 820, alignSelf: 'center' }}
        scrollIndicatorInsets={{ top: headerHeight, bottom: footerHeight }}
        onScrollToIndexFailed={info => { list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false }); }}
        ListHeaderComponent={page?.hasMore ? <Button title="Load earlier messages" disabled={action.busy} onPress={() => void action.run(async () => { pause(); await session.load(destination.threadId, { before: page.messages[0]?.id }); })} /> : null}
        renderItem={({ item, index }) => <View style={{ gap: 6 }}>{(index === 0 || item.at - messages[index - 1].at > 300_000) && <Label size={13} muted style={{ textAlign: 'center', marginTop: index ? 6 : 0 }}>{new Date(item.at).toDateString() === new Date().toDateString() ? 'Today' : new Date(item.at).toLocaleDateString()} {new Date(item.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Label>}{item.activityRun ? <ActivityRun items={item.activityRun} client={session.client} destination={destination} onChanged={refresh} /> : <MessageBubble onEnter={() => entranceRows.claim(item.id)} name={owner?.name} message={item} client={session.client} destination={destination} onChanged={refresh} versions={item.role === 'user' && item.kind === 'text' ? (page?.messages ?? []).filter(m => m.role === 'user' && m.kind === 'text' && m.parentId === item.parentId).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)) : []} />}</View>}
        ListEmptyComponent={setupPending && group ? <View style={{ padding: 16, gap: 12, borderRadius: 16, backgroundColor: c.card }}>
          <Label size={18} bold>Ready to chat?</Label>
          <Label muted>This group was created with setup unfinished. Start chatting with its current members and settings.</Label>
          {canAdminister(session.client.connection)
            ? <Button title={action.busy ? 'Starting…' : 'Start chatting'} primary disabled={action.busy || !activeRoom} onPress={() => void action.run(async () => {
              await session.client.startGroupChat(group.id);
              await session.refresh();
            })} />
            : <Label muted>Ask the workspace owner to finish this group's setup.</Label>}
        </View> : page ? null : <Label muted>Loading conversation…</Label>}
        ListFooterComponent={<View style={{ gap: 10, paddingBottom: 14 }}>{isTyping(state, destination.threadId, !!busy) && <LiveBubble key={key} visible name={owner?.name ?? 'Your bot'} color={owner && 'color' in owner && owner.color === 'green' ? '#009957' : '#377FE6'} />}

        </View>} />
    <View pointerEvents="box-none" onLayout={event => setFooterHeight(event.nativeEvent.layout.height)} style={[styles.footerOverlay, { paddingBottom: insets.bottom }]}>
      <Svg pointerEvents="none" width="100%" height={footerHeight} style={{ position: 'absolute', bottom: 0, left: 0 }}>
        <Defs><LinearGradient id="footerFade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={c.bg} stopOpacity={0} /><Stop offset="0.65" stopColor={c.bg} stopOpacity={0.4} /><Stop offset="1" stopColor={c.bg} stopOpacity={0.75} /></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#footerFade)" />
      </Svg>
      <View pointerEvents="box-none" style={{ paddingTop: 24 }}>
        <ErrorNotice error={action.error} />
        {!activeRoom && <ErrorNotice error="The desktop switched this channel to another thread. Choose the active thread before sending." />}
        {more && <ComposerMenu name={owner?.name ?? 'your bot'} bot={destination.kind === 'bots'} onClose={() => setMore(false)} onChoose={id => { setMore(false); if (id === 'photo' || id === 'file') void pick(id === 'photo'); else if (id === 'threads') onThreads(); else if (id === 'profile') onProfile(); else if (id === 'computer') onComputer(); else if (id === 'new') void action.run(async () => { const result = await session.client.createTask(destination, ''); await session.refresh(); const next = result.bot ?? result.group; if (next) onSelect({ ...destination, threadId: next.threadId }); }); else void action.run(async () => shareResponse(await session.client.response(`/api/threads/${routeId(destination.threadId)}/export?format=${id === 'json' ? 'json' : 'md'}`), `conversation.${id === 'json' ? 'json' : 'md'}`)); }} />}
        {(slash || draft.text.startsWith('/')) && <CommandHUD draft={draft.text} bot={destination.kind === 'bots'} onClose={() => { setSlash(false); if (draft.text === '/') update({ text: '' }); }} onChoose={(id, prompt) => { setSlash(false); if (draft.text.startsWith('/')) update({ text: '' }); if (id === 'computer') onComputer(); else if (id === 'threads') onThreads(); else void send(prompt); }} />}
        <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8, gap: 6 }}>
          {(state.queues[destination.threadId] ?? []).map(q => <Row key={q.queueId} style={{ flexWrap: 'nowrap', borderRadius: 18, backgroundColor: c.text+'14', paddingLeft: 12, paddingRight: 6, paddingVertical: 6, gap: 8 }}><Label numberOfLines={2} style={{ flex: 1 }}>{q.text}</Label>{destination.kind === 'bots' && <Button title={action.busy ? 'Steering…' : 'Steer'} text disabled={action.busy} style={{ backgroundColor: c.text+'1F' }} onPress={() => void action.run(() => session.client.stop(destination))} />}<IconButton icon="delete" label="Delete this queued message" chrome={false} glyph={16} onPress={() => void action.run(() => session.client.cancelQueued(destination,q.queueId))} /></Row>)}
          {!!draft.files.length && <ScrollView horizontal><Row>{draft.files.map((f, i) => <Button key={`${f.path}-${i}`} title={`× ${f.name}`} disabled={action.busy} onPress={() => update({ files: draft.files.filter((_, n) => n !== i), sendId: undefined })} />)}</Row></ScrollView>}
          <Row style={{ flexWrap: 'nowrap', gap: 10, alignItems: 'flex-end' }}><IconButton icon={more ? 'close' : 'add'} label={more ? "Close" : "More"} size={44} glyph={22} surface={more ? c.text : c.chrome} color={more ? c.bg : c.text} onPress={() => setMore(!more)} /><View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: c.chrome, borderRadius: 24, minHeight: 48, elevation: 6 }}><Pressable accessibilityRole="button" accessibilityLabel="Slash commands" onPress={() => setSlash(!slash)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Label size={18} bold muted style={{ fontFamily: 'monospace' }}>/</Label></Pressable><ComposerInput revision={draftRevision} accessibilityLabel="Message" placeholder={draft.sending ? 'Sending…' : busy ? engineCanSteer ? 'Add to turn…' : 'Queue…' : 'Message'} placeholderTextColor={c.muted} value={draft.text} multiline
            enterKeyHint="send" submitBehavior="submit"
            // React Native Web still uses blurOnSubmit for multiline submission.
            blurOnSubmit={Platform.OS === 'web'} onSubmitEditing={event => { typeText(event.nativeEvent.text); void send(); }}
            onChangeText={typeText} style={{ flex: 1, color: c.text, paddingVertical: 13, paddingLeft: 6, paddingRight: 0, minHeight: 48, maxHeight: 150, fontSize: 17, lineHeight: 22, includeFontPadding: false, textAlignVertical: 'top', letterSpacing: 0.5 }} /><View style={{ marginRight: 6 }}><Dictation text={draft.text} onText={text => update({ text, sendId: undefined })} disabled={action.busy || !!draft.sending} /></View><IconButton icon="send" label="Send" size={32} surface={draft.text.trim() || draft.files.length ? c.mine : c.muted + '2E'} elevation={0} glyph={16} color={draft.text.trim() || draft.files.length ? c.mineText : c.muted} disabled={action.busy || draft.sending || !activeRoom || setupPending || (!draft.text.trim() && !draft.files.length) || state.status === 'revoked'} onPress={() => void send()} /></View></Row>
        </View>
      </View>
    </View>
  </View>;
}

const EMPTY_DRAFT: Draft = { text: '', files: [] };

const styles = StyleSheet.create({
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  footerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  identityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    maxWidth: '100%',
    borderRadius: 24,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 6,
    gap: 8,
    elevation: 3,
  },
});

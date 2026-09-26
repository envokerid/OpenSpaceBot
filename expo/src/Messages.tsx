import React, { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import * as WebBrowser from 'expo-web-browser';
import { randomUUID } from 'expo-crypto';
import { QuestionCard } from './QuestionCard';
import { McpApprovalScope } from './McpApprovalScope';
import { reviewedSkillSha256 } from '../../shared/skill-request';
import { splitTranscriptAttachments } from '../../src/lib/composer-attachments';
import type { Client } from './core/client';
import { routeId } from './core/client';
import { isConversationNotice } from './core/transcript';
import type { Bot, Destination, Message } from './core/types';
import { AttachmentView } from './AttachmentView';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { SpeechBubble } from './SpeechBubble';
import { GoalHeading, GoalProgress } from './Goal';
import { shareResponse } from './attachments';
import { useAuthenticatedImage } from './images';
import { Button, DialogBody, ErrorNotice, Input, Label, Row, Sheet, useAction, useTheme } from './ui';

export function MarkdownText({ text, onFile }: { text: string; onFile?: (path: string) => void }) {
  const c = useTheme();
  return <Markdown markdownit={MarkdownIt({ typographer: false })} style={{ body: { color: c.text, fontSize: 17, lineHeight: 24, letterSpacing: 0.5 }, code_inline: { backgroundColor: c.bg, color: c.text }, fence: { backgroundColor: c.bg, color: c.text, borderColor: c.line }, code_block: { backgroundColor: c.bg, color: c.text }, link: { color: c.accent }, blockquote: { backgroundColor: c.bg, borderColor: c.line }, paragraph: { marginTop: 0, marginBottom: 0 } }}
    rules={{ image: node => <Text key={node.key} style={{ color: c.muted }} onPress={() => onFile?.(node.attributes.src)}>Image: {node.attributes.alt || 'attachment'} (tap to open)</Text> }}
    onLinkPress={url => { if (/^https?:\/\//i.test(url)) void Linking.openURL(url); else onFile?.(url); return false; }}>{text}</Markdown>;
}

function SecureImage({ client, path }: { client: Client; path: string }) {
  const { uri, failed } = useAuthenticatedImage(client, path);
  return uri ? <Image accessibilityLabel="Message image" source={{ uri }} resizeMode="contain" style={{ width: '100%', height: 260, borderRadius: 12 }} /> : <Label muted>{failed ? 'Could not load image.' : 'Loading image…'}</Label>;
}

function Approval({ message, client, destination, onChanged, name }: { name?: string; message: Message; client: Client; destination: Destination; onChanged: () => Promise<unknown> }) {
  const card = message.card!; const action = useAction(); const c = useTheme();
  const [freeText, setFreeText] = useState('');
  const pending = !card.answered && !card.dismissed;
  const questions = card.questionRequest?.questions ?? [];
  const skillHash = card.skillRequest ? reviewedSkillSha256(card.skillRequest) : undefined;
  const answer = (choice: string, structured = false) => action.run(async () => {
    if (card.requestId) {
      const refusal = /^(deny|cancel|dismiss|no)$/i.test(choice.trim());
      const behavior = structured || !card.tool ? 'answer' : refusal ? 'deny' : 'allow';
      if (card.skillRequest && behavior === 'allow' && !skillHash) throw new Error('This skill has no reviewable preview. Review it on the computer.');
      if (behavior === 'allow' && /^always allow/i.test(choice) && card.allowKey && destination.kind === 'bots') {
        await client.request(`/api/bots/${routeId(destination.id)}/always-allow`, 'POST', { allowKey: card.allowKey, threadId: destination.threadId });
      }
      await client.respond(destination.threadId, card.requestId, behavior, behavior === 'answer' ? choice : undefined, behavior === 'allow' ? skillHash : undefined);
    } else {
      await client.card(destination, message.id, choice);
      await client.send(destination, choice, randomUUID());
    }
    await onChanged();
  });
  if (questions.length) return <QuestionCard name={name ?? 'Your bot'} questions={questions} settled={!pending} answered={card.answeredText ?? card.answered} busy={action.busy} error={action.error} onAnswer={text => void answer(text, true)} />;
  return <View style={{ backgroundColor: c.muted+'21', borderRadius: 22, borderWidth: pending ? 1.5 : 0, borderColor: c.accent, padding: 16, gap: 12 }}><Label size={16} bold>{card.title}</Label>{!!card.subtitle && <Label muted>{card.subtitle}</Label>}
    {card.skillRequest && <><Label bold>{card.skillRequest.name}</Label><Label>{card.skillRequest.gist}</Label>{card.skillRequest.warnings.map(w => <Label key={w}>{w}</Label>)}<Text selectable style={{ fontFamily: 'monospace', color: c.text }}>{card.skillRequest.preview ?? 'Preview unavailable. Approval requires the computer.'}</Text></>}
    {card.profileRequest && <><Label>{card.profileRequest.reason}</Label>{Object.entries(card.profileRequest.changes).map(([key, value]) => <View key={key}><Label bold>{key}</Label><Label muted>Before: {card.profileRequest?.before[key as keyof typeof card.profileRequest.before] || '(empty)'}</Label><Label>After: {value}</Label></View>)}</>}
    {card.teamSetupRequest && <><Label>{card.teamSetupRequest.reason}</Label>{card.teamSetupRequest.operations.map((op, i) => <View key={i}><Label bold>{op.action}: {op.fields.name ?? op.botId}</Label>{Object.entries(op.fields).map(([key, value]) => <Label key={key}>{key}: {typeof value === 'string' ? value : JSON.stringify(value)}</Label>)}</View>)}{card.teamSetupRequest.deletion && <Label>Delete {card.teamSetupRequest.deletion.name}</Label>}</>}
    {card.routineRequest && <><Label bold>Routine: {card.routineRequest.operation.action}</Label>{Object.entries(card.routineRequest.operation).filter(([key]) => !['action', 'expectedUpdatedAt'].includes(key)).map(([key, value]) => <View key={key}><Label bold>{key}</Label><Label>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</Label></View>)}</>}
    {!pending ? <Row style={{ gap: 6 }}><Icon name="check" size={16} color={c.muted} /><Label size={14} muted>{card.answeredText ?? card.answered ?? 'Dismissed'}</Label></Row> : <><Row style={{ minHeight: 48, alignContent: 'center' }}>{card.options.map(choice => <Button key={choice} title={choice} disabled={action.busy || (!!card.skillRequest && !skillHash && !/deny|cancel|dismiss/i.test(choice))} primary={!/deny|cancel|dismiss/i.test(choice)} tonal={/deny|cancel|dismiss/i.test(choice)} onPress={() => void answer(choice)} />)}</Row>
      {!card.tool && <><Input label="Write an answer" value={freeText} onChangeText={setFreeText} /><Button title="Answer" disabled={!freeText.trim() || action.busy} onPress={() => void answer(freeText)} /></>}
      {card.mcpTool && card.tool && card.requestId && card.approvalScope !== 'local-computer' && card.heldCode !== 'approval.held.sandbox' && <McpApprovalScope key={card.requestId} client={client} tool={card.tool} botId={message.from?.botId ?? (destination.kind === 'bots' ? destination.id : undefined)} onApprove={async () => {
        await client.respond(destination.threadId, card.requestId!, 'allow');
        await onChanged();
      }} />}
    </>}
    <ErrorNotice error={action.error} />
  </View>;
}

export const MessageBubble = React.memo(function MessageBubble({ message, client, destination, onChanged, versions = [], name, speaker, onEnter }: { onEnter?: () => boolean; name?: string; speaker?: Bot; message: Message; client: Client; destination: Destination; onChanged: () => Promise<unknown>; versions?: Message[] }) {
  const c = useTheme(); const action = useAction(); const [details, setDetails] = useState(false); const [edit, setEdit] = useState<string>();
  const [menu, setMenu] = useState<{ x: number; y: number }>(); const [selectText,setSelectText] = useState(false); const [copied, setCopied] = useState(false);
  const content = splitTranscriptAttachments(message.text ?? '');
  const goal = message.channelMode === 'goal' || !!message.goalRun;
  const groupSpeaker = destination.kind === 'groups' && message.role !== 'user' ? speaker ?? message.from : undefined;
  const reactions = [...new Set(message.reactions?.map(r => r.emoji))].map(emoji => ({ emoji, count: message.reactions!.filter(r => r.emoji === emoji).length, mine: message.reactions!.some(r => r.emoji === emoji && r.by === 'user') }));
  const versionIndex = versions.findIndex(v => v.id === message.id);
  const switchVersion = (index: number) => action.run(async () => {
    await client.request(`/api/bots/${routeId(destination.id)}/active-branch`, 'POST', { messageId: versions[index].id, threadId: destination.threadId });
    await onChanged();
  });
  const file = (path: string) => action.run(async () => {
    if (path.startsWith('file://')) path = decodeURIComponent(new URL(path).pathname);
    await shareResponse(await client.response(`/api/threads/${routeId(destination.threadId)}/messages/${routeId(message.id)}/file`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }), path.split(/[\\/]/).pop() ?? 'attachment');
  });
  const botId = message.from?.botId ?? (destination.kind === 'bots' ? destination.id : undefined);
  const cardAction = (family: 'connector' | 'secret', verb: string) => action.run(async () => {
    if (!botId) throw new Error('Open this request in its bot conversation.');
    const result = await client.request<{ url?: string }>(`/api/bots/${routeId(botId)}/${family}-cards/${routeId(message.id)}/${verb}`, 'POST', { threadId: destination.threadId });
    if (result.url) { if (new URL(result.url).protocol !== 'https:') throw new Error('The sign-in link must use HTTPS.'); await WebBrowser.openBrowserAsync(result.url); }
    await onChanged();
  });
  if (message.card) return <Approval name={name} message={message} client={client} destination={destination} onChanged={onChanged} />;
  if (isConversationNotice(message)) return <View style={{ paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: message.tool?.ok === false ? c.danger : c.muted }} /><Label size={13} muted style={{ flexShrink: 1 }}>{message.tool?.name ?? message.text}</Label></View>;
  if (message.kind === 'activity' || message.tool) return <View style={{ paddingHorizontal: 4, gap: 8 }}><Pressable onPress={() => setDetails(!details)} accessibilityRole="button" accessibilityLabel={`${message.tool?.name ?? 'Activity'}, ${message.tool?.ok === false ? 'failed' : 'success'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: message.tool?.ok === false ? c.danger : c.muted }} /><Label size={13} muted>{message.tool?.name ?? message.text}</Label></Pressable>{details && <View style={{ padding: 12, borderRadius: 12, backgroundColor: c.card }}><Label size={13} selectable style={{ fontFamily: 'monospace' }}>{[message.tool?.input, message.tool?.output].filter(Boolean).join('\n\n') || message.tool?.summary || 'No additional details.'}</Label></View>}</View>;
  return <><SpeechBubble onEnter={onEnter} mine={message.role === 'user'} goal={goal} fullWidth={!!message.goalRun} onLongPress={event => setMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })}>
    {goal && <GoalHeading run={message.goalRun} />}
    {groupSpeaker ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 24, height: 24, flexShrink: 0 }}><Avatar bot={groupSpeaker} client={client} size={24} animated={false} /></View><Label size={13} bold style={{ flexShrink: 1 }}>{groupSpeaker.name}</Label></View> : !!message.from?.name && message.role !== 'user' && <Label size={13} bold>{message.from.name}</Label>}
    {[...content.images.map(item => ({ ...item, image: true })), ...content.files.map(item => ({ ...item, image: false }))].map((item,index) => <AttachmentView key={`${item.path}-${index}`} client={client} threadId={destination.threadId} messageId={message.id} path={item.path} name={item.name} image={item.image} mine={message.role === 'user'} />)}
    {message.kind === 'screen' && <SecureImage client={client} path={`/api/threads/${routeId(destination.threadId)}/messages/${routeId(message.id)}/image`} />}
    {message.attachments?.filter((a,i,all) => all.findIndex(other => other.path === a.path) === i).map(a => <AttachmentView key={a.path} client={client} threadId={destination.threadId} messageId={message.id} path={a.path} name={a.path.split('/').pop() ?? 'Image'} image mine={message.role === 'user'} />)}
    {!!content.display && !message.compaction && !message.routineRun && !message.goalRun && (message.role === 'user' ? <Text selectable style={{ color: goal ? '#FFFFFF' : c.mineText, fontSize: 17, lineHeight: 24, includeFontPadding: false, letterSpacing: 0.5 }}>{content.display}</Text> : <MarkdownText text={content.display} onFile={path => void file(path)} />)}
    {message.digest && !message.text && <><Label bold>Work summary</Label><Label>{message.digest.reply}</Label><Label muted>{message.digest.tools.map(tool => `${tool.name}: ${tool.count} calls`).join(' · ')}</Label></>}
    {message.compaction && <Label>{message.compaction.summary}</Label>}
    {message.routineRun && <><Label bold>{message.routineRun.routineName} · {message.routineRun.status}</Label><Label>{message.routineRun.summary ?? message.routineRun.error ?? ''}</Label></>}
    {message.goalRun && <GoalProgress run={message.goalRun} />}
    {message.connector && <><Label bold>Connect {message.connector.slug}</Label><Label>{message.connector.error ?? 'Complete sign-in, then return here to continue.'}</Label>{!message.connector.dismissed && !message.connector.resumed && <Row><Button title="Sign in" disabled={action.busy} onPress={() => void cardAction('connector', 'authorize')} /><Button title="Continue" disabled={action.busy} onPress={() => void cardAction('connector', 'resume')} /><Button title="Dismiss" disabled={action.busy} onPress={() => void cardAction('connector', 'dismiss')} /></Row>}</>}
    {message.secret && <><Label bold>{message.secret.label}</Label><Label>{message.secret.description}</Label><Label muted>Provide this credential in the desktop app, then continue here.</Label>{!message.secret.dismissed && !message.secret.resumed && <Row><Button title="Continue" disabled={action.busy} onPress={() => void cardAction('secret', 'resume')} /><Button title="Dismiss" disabled={action.busy} onPress={() => void cardAction('secret', 'dismiss')} /></Row>}</>}
  </SpeechBubble>{(!!message.reactions?.length || !!action.error || (destination.kind === 'bots' && versions.length > 1)) && <View style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
    {!!message.reactions?.length && <Row>{reactions.map(reaction => <Pressable key={reaction.emoji} onPress={() => void action.run(async () => { await client.reaction(destination, message.id, reaction.emoji); await onChanged(); })} style={{ borderRadius: 20, borderWidth: 1, borderColor: (reaction.mine ? c.accent : c.muted)+'80', paddingHorizontal: 10, paddingVertical: 3 }}><Label size={13} style={{ color: reaction.mine ? c.accent : c.muted }}>{reaction.emoji} {reaction.count}</Label></Pressable>)}</Row>}
    <ErrorNotice error={action.error} />
    {destination.kind === 'bots' && versions.length > 1 && <Row style={{ gap: 8 }}>{[-1,1].map((delta,index) => <React.Fragment key={delta}>{index === 1 && <Label size={12} muted style={{ fontWeight: '500' }}>{versionIndex + 1} of {versions.length}</Label>}<Pressable accessibilityRole="button" accessibilityLabel={delta === -1 ? 'Previous version' : 'Next version'} disabled={action.busy || versionIndex + delta < 0 || versionIndex + delta >= versions.length} hitSlop={12} onPress={() => void switchVersion(versionIndex + delta)} style={{ opacity: action.busy || versionIndex + delta < 0 || versionIndex + delta >= versions.length ? 0.4 : 1 }}><Icon name={delta === -1 ? 'chevronLeft' : 'chevron'} size={20} color={c.muted} /></Pressable></React.Fragment>)}</Row>}
</View>}{menu && <Menu {...menu} onClose={() => setMenu(undefined)}><Row style={{ justifyContent: 'space-around', paddingHorizontal: 12, paddingVertical: 4, gap: 0 }}>{['👍', '❤️', '😂', '🎉', '👀'].map(emoji => <Pressable key={emoji} onPress={() => void action.run(async () => { await client.reaction(destination, message.id, emoji); setMenu(undefined); await onChanged(); })} style={{ padding: 8 }}><Label size={22}>{emoji}</Label></Pressable>)}</Row><View style={{ height: 1, backgroundColor: c.line }} />{[['Copy', () => void action.run(async () => { const clipboard = await import('expo-clipboard'); await clipboard.setStringAsync(content.display); setMenu(undefined); })], ['Select text', () => { setMenu(undefined); setSelectText(true); }], ...(message.role === 'user' && destination.kind === 'bots' && !content.files.length && !content.images.length ? [['Edit and retry', () => { setEdit(message.text ?? ''); setMenu(undefined); }]] : [])].map(([title, onPress]) => <Pressable key={title as string} onPress={onPress as () => void} style={{ paddingHorizontal: 12, minHeight: 48, justifyContent: 'center' }}><Label size={16}>{title as string}</Label></Pressable>)}</Menu>}
  {edit !== undefined && <Sheet centered title="Edit and retry" onClose={() => setEdit(undefined)}><DialogBody actions={<><Button title="Cancel" text onPress={() => setEdit(undefined)} /><Button title="Send" text disabled={action.busy || !edit.trim()} onPress={() => void action.run(async () => { await client.edit(destination,message.id,edit.trim()); setEdit(undefined); await onChanged(); })} /></>}><Label>This creates a new version and continues from there.</Label><Input label="Message" value={edit} onChangeText={setEdit} multiline /><ErrorNotice error={action.error} /></DialogBody></Sheet>}
  {selectText && <Sheet centered title="Select text" onClose={() => setSelectText(false)}><DialogBody gap={10} actions={<><Button title="Done" text onPress={() => setSelectText(false)} /><Button title={copied ? 'Copied' : 'Copy all'} text onPress={() => void import('expo-clipboard').then(async c => { await c.setStringAsync(content.display); setCopied(true); })} /></>}><ScrollView style={{ maxHeight: 360 }}><Text selectable style={{ color: c.muted, fontSize: 16, lineHeight: 24 }}>{content.display}</Text></ScrollView><Label size={12} muted>Touch and hold the text to select part of it.</Label></DialogBody></Sheet>}</>;
}, (before, after) => before.message === after.message && before.client === after.client
  && before.name === after.name && sameSpeaker(before.speaker, after.speaker) && before.onChanged === after.onChanged
  && before.destination.kind === after.destination.kind && before.destination.id === after.destination.id
  && before.destination.threadId === after.destination.threadId
  && (before.versions?.length ?? 0) === (after.versions?.length ?? 0)
  && (before.versions ?? []).every((message, index) => message === after.versions?.[index]));

// Busy/unread/token updates do not change a historical speaker's identity.
// These small avatars do not animate activity, so avoid reparsing every reply.
function sameSpeaker(a?: Bot, b?: Bot) {
  return a === b || (!!a && !!b && a.id === b.id && a.name === b.name && a.color === b.color
    && a.mascotExpression === b.mascotExpression && a.avatarUrl === b.avatarUrl && a.avatarCrop === b.avatarCrop && a.mascotBody === b.mascotBody);
}

export function ActivityRun({ items, ...props }: { items: Message[]; client: Client; destination: Destination; onChanged: () => Promise<unknown> }) {
 const [expanded,setExpanded] = useState(false); const c = useTheme(); const running = items.some(i => i.tool?.ok == null); const summary = `${running ? 'Running' : 'Ran'} ${items.length} steps`;
 return <View style={{ paddingLeft: 4, gap: 5 }}><Pressable accessibilityLabel={`${summary}, ${expanded ? 'expanded' : 'collapsed'}`} onPress={() => setExpanded(!expanded)} style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}><Row style={{ backgroundColor: c.muted+'1A', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6, gap: 6 }}><Label size={13} style={{ color: '#22C55E' }}>{running ? '◌' : '✓'}</Label><Label size={13}>{summary}</Label><Label size={12} muted>{expanded ? 'Hide' : 'Show'}</Label></Row></Pressable>{expanded && items.map(message => <MessageBubble key={message.id} message={message} {...props} />)}</View>;
}

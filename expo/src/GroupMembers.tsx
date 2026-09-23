import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { Session } from './core/session';
import { canAdminister, type Bot, type Group, type Instance } from './core/types';
import { Avatar } from './Avatar';
import { GroupInstructions } from './GroupInstructions';
import { Icon } from './Icon';
import { Button, Choice, ErrorNotice, FormSection, Label, SettingsSurface, Sheet, useAction, useTheme } from './ui';

export function GroupMembers(props: React.ComponentProps<typeof GroupMembersContent>) {
  return <SettingsSurface modal><GroupMembersContent {...props} /></SettingsSurface>;
}

function GroupMembersContent({ session, group, bots, onClose }: {
  session: Session; group: Group; bots: Bot[]; onClose: () => void;
}) {
  const c = useTheme();
  const action = useAction();
  const opened = useRef([...group.memberIds]);
  const openedBulletin = useRef(group.bulletin);
  const [picked, setPicked] = useState(() => [...group.memberIds]);
  const [bulletin, setBulletin] = useState(group.bulletin);
  const openedJudge = useRef(group.judgeModelSelection ?? null);
  const [judge, setJudge] = useState<Group['judgeModelSelection'] | null>(openedJudge.current);
  const [instances, setInstances] = useState<Instance[]>([]);
  useEffect(() => { let mounted = true; void session.client.instances().then(result => { if (mounted) setInstances(result.instances.filter(i => i.capabilities?.agentsMcp)); }).catch(() => {}); return () => { mounted = false; }; }, [session]);
  const instance = instances.find(i => i.instanceId === judge?.instanceId);
  const [closing, setClosing] = useState(false);
  const allowed = canAdminister(session.client.connection) && !group.dm;
  const candidates = bots.filter(bot => allowed ? !bot.hidden || group.memberIds.includes(bot.id) : group.memberIds.includes(bot.id));
  const close = () => { if (!action.busy) setClosing(true); };
  const save = () => action.run(async () => {
    if (!allowed || !picked.length || closing) return;
    await session.client.groupMembers(group.id, picked, opened.current,
      { ...(bulletin !== openedBulletin.current ? { bulletin, expectedBulletin: openedBulletin.current } : {}),
        ...(JSON.stringify(judge) !== JSON.stringify(openedJudge.current) ? { judgeModelSelection: judge, expectedJudgeModelSelection: openedJudge.current } : {}) });
    setClosing(true);
    await session.refresh();
  });

  return <Sheet slide swipeToDismiss={!action.busy} closing={closing} onDismiss={onClose} title={group.name} closeLabel="Back" headerPaddingHorizontal={16} onClose={close} action={allowed ? <Button title={action.busy ? 'Saving…' : 'Save'} text disabled={!picked.length || action.busy || closing} onPress={() => void save()} /> : <Button title="Done" text onPress={close} />}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8, paddingBottom: 24, gap: 16 }}>
      <GroupInstructions value={allowed ? bulletin : group.bulletin} onChange={allowed ? setBulletin : undefined} disabled={action.busy || closing} />
      <FormSection title="Room judge" footer="Members submit reasons and ready-made replies in parallel. The judge reads the chat history and selects the next message to post.">
        <Choice label="Judge provider" value={judge?.instanceId ?? ''} disabled={!allowed || action.busy || closing || group.working}
          options={[{ id: '', label: 'Automatic · first active member’s model' }, ...(judge && !instance ? [{ id: judge.instanceId, label: `${judge.instanceId} (unavailable)` }] : []), ...instances.map(i => ({ id: i.instanceId, label: i.displayName }))]}
          onChange={id => { const next = instances.find(i => i.instanceId === id); setJudge(next ? { instanceId: id, model: next.models.default } : null); }} />
        {judge && <Choice label="Judge model" value={judge.model} disabled={!allowed || action.busy || closing || group.working}
          options={[...(!instance?.models.options.some(m => m.id === judge.model) ? [{ id: judge.model, label: judge.model }] : []), ...(instance?.models.options.map(m => ({ id: m.id, label: m.label ?? m.id })) ?? [])]}
          onChange={model => setJudge({ instanceId: judge.instanceId, model })} />}
      </FormSection>
      <FormSection title="Bots in this group" footer={allowed ? 'Choose the bots in this group. Existing messages stay in the conversation.' : undefined}>
        {candidates.map(bot => <Pressable key={bot.id} accessibilityRole={allowed ? 'checkbox' : undefined} accessibilityLabel={bot.name}
          accessibilityState={allowed ? { checked: picked.includes(bot.id), disabled: action.busy || closing } : undefined} disabled={!allowed || action.busy || closing}
          onPress={() => setPicked(ids => ids.includes(bot.id) ? ids.filter(id => id !== bot.id) : [...ids, bot.id])}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 }}>
          <Avatar bot={bot} client={session.client} size={36} />
          <Label bold style={{ flex: 1 }}>{bot.name}{bot.hidden ? ' (archived)' : ''}</Label>
          {allowed && <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: picked.includes(bot.id) ? 0 : 1, borderColor: c.muted }}>
            {picked.includes(bot.id) && <Icon name="checkCircle" size={20} color={c.accent} />}
          </View>}
        </Pressable>)}
        {allowed && !picked.length && <Label muted>A group needs at least one bot.</Label>}
      </FormSection>
      {action.error && <View style={{ paddingHorizontal: 20 }}><ErrorNotice error={action.error} /></View>}
    </ScrollView>
  </Sheet>;
}

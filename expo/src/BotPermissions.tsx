import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ScrollView, View } from 'react-native';
import type { BotPermissionsPatch } from '../../shared/bot-permissions';
import type { Session } from './core/session';
import type { Bot, Instance } from './core/types';
import { canAdminister } from './core/types';
import { approvalLabels, mobileApprovalSettings } from './core/permissions';
import { ActionRow, Button, ErrorNotice, FormSection, Header, Label, Loading, RadioRow, Row, Sheet, Toggle, useAction } from './ui';

export function BotPermissions({ session, bot, onBack }: { session: Session; bot: Bot; onBack: () => void }) {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const [instances, setInstances] = useState<Instance[]>();
  const [localWarning, setLocalWarning] = useState(false);
  const action = useAction();
  const loading = useAction();
  const load = () => loading.run(async () => setInstances((await session.client.instances()).instances));
  useEffect(() => { void load(); }, [session]);
  const engine = instances?.find(i => i.instanceId === bot.modelSelection.instanceId);
  const canCoordinate = engine?.capabilities?.agentsMcp === true;
  const admin = canAdminister(session.client.connection);
  const disabled = action.busy || !admin;
  const approval = mobileApprovalSettings(bot, engine);
  const ownTeam = bot.section?.trim() || '';
  const currentChief = state.bots.find(b => b.chiefOfStaff && (b.section?.trim() || '') === ownTeam && b.id !== bot.id);
  const patch = async (fields: BotPermissionsPatch) => {
    await session.client.permissions(bot.id, fields);
    await session.refresh();
  };
  const save = (fields: BotPermissionsPatch) => void action.run(() => patch(fields));

  if (localWarning) return <Sheet full onClose={() => setLocalWarning(false)}>
    <Header title="Local computer approval" onBack={() => setLocalWarning(false)} />
    <ScrollView contentContainerStyle={{ paddingVertical: 20, gap: 20 }}>
      <FormSection><ErrorNotice error={action.error} /></FormSection>
      <FormSection title="Allow Auto mode on this computer?">
        <Label>Auto mode will let this bot click, type, and run tools on its selected local computer without asking first. Destructive and sensitive actions still stop. Continue only if you are watching.</Label>
        <Row><Button title="Cancel" disabled={action.busy} onPress={() => setLocalWarning(false)} /><Button title="Enable Auto mode" disabled={disabled || approval.locked} onPress={() => void action.run(async () => { await patch({ approvalMode: 'auto', acknowledgeLocalAuto: true }); setLocalWarning(false); })} /></Row>
      </FormSection>
    </ScrollView>
  </Sheet>;

  return <Sheet full onClose={onBack}>
    <Header title="Permissions" onBack={onBack} />
    <ScrollView contentContainerStyle={{ paddingVertical: 20, paddingBottom: 32, gap: 24 }}>
      <FormSection footer="Role and approval changes save immediately and apply to this bot.">
        <Label bold size={20}>{bot.name}</Label>
        {!admin && <Label muted>Admin access is needed to change bot permissions.</Label>}
        <ErrorNotice error={action.error} />
        <ErrorNotice error={loading.error} />
        {loading.busy && <Loading />}
        {loading.error && <ActionRow title="Retry loading provider" onPress={() => void load()} />}
        {instances && !engine && <Label muted>This bot's provider is unavailable. Choose a provider in bot settings to change its approval level.</Label>}
      </FormSection>
      <FormSection title="Chief of Staff">
        <Row><View style={{ flex: 1 }}><Label bold>Chief of Staff</Label><Label muted size={13}>One for {ownTeam || 'General'}</Label></View><Toggle label="Chief of Staff" value={!!bot.chiefOfStaff} disabled={disabled || (!bot.chiefOfStaff && !canCoordinate)} onChange={chiefOfStaff => save({ chiefOfStaff })} /></Row>
        <Label muted size={13}>{bot.chiefOfStaff && !canCoordinate
          ? 'This bot still holds the role, but its current provider cannot contact teammates. Choose a provider that supports bot coordination.'
          : bot.chiefOfStaff ? `This is the primary contact for ${ownTeam || 'General'}. It can create and coordinate specialists in this team, then combine their work into one answer.`
          : !canCoordinate ? 'Choose a provider that supports bot coordination.'
          : currentChief ? `Make this bot the ${ownTeam || 'General'} Chief and hand the role over from ${currentChief.name}.`
          : `Make this bot the primary contact for the ${ownTeam || 'General'} team.`}</Label>
      </FormSection>
      {bot.chiefOfStaff && <ManagedTeams key={bot.id + JSON.stringify(bot.managedSections ?? [])} bot={bot} teams={[...state.sections, '', ...state.bots.map(b => b.section?.trim() || ''), ...state.groups.map(g => g.section?.trim() || '')]} disabled={disabled} onSave={managedSections => save({ managedSections, acknowledgePeerScope: true })} />}
      <FormSection title="Teammates">
        <Row style={{ flexWrap: 'nowrap' }}><Label style={{ flex: 1 }}>Ask me before contacting other bots</Label><Toggle label="Ask me before contacting other bots" value={!!bot.approvePeerComms} disabled={disabled || (!bot.approvePeerComms && !canCoordinate)} onChange={approvePeerComms => save({ approvePeerComms })} /></Row>
        <Label muted size={13}>{bot.approvePeerComms ? 'This bot will stop and ask before it reaches out to another bot.' : 'Let this bot talk to teammates on its own, without a confirmation step.'}</Label>
      </FormSection>
      <FormSection title="Approval level" footer="Full access and Custom must be enabled in the packaged desktop app. Custom must also be changed there.">
        <Label muted size={13}>Default for new threads, routines and delegated work. Existing threads keep their approval levels.</Label>
        <Label bold>Current: {approvalLabels[approval.mode]}</Label>
        {bot.busy && <Label muted size={13}>Stop this bot's turn before changing its approval level.</Label>}
        {approval.options.map(option => <View key={option.id}>
          <RadioRow title={option.label} selected={approval.mode === option.id} disabled={disabled || approval.locked} onPress={() => {
            if (option.id === approval.mode) return;
            if (option.id === 'auto' && bot.computer === 'local') setLocalWarning(true);
            else save({ approvalMode: option.id });
          }} />
          <Label muted size={13} style={{ marginLeft: 36 }}>{option.description}</Label>
        </View>)}
      </FormSection>

    </ScrollView>
  </Sheet>;
}

function ManagedTeams({ bot, teams, disabled, onSave }: { bot: Bot; teams: string[]; disabled: boolean; onSave: (teams: string[]) => void }) {
  const allowed = bot.managedSections ?? [];
  const [selected, setSelected] = useState(allowed);
  const choices = [...new Set([...teams, ...allowed])].filter(team => team !== (bot.section?.trim() || '')).sort();
  const changed = JSON.stringify([...selected].sort()) !== JSON.stringify([...allowed].sort());
  return <FormSection title="Additional teams" footer="Your own team is already included. Other bots keep their permissions, and unrelated chat history stays private.">
    <Label muted size={13}>Let {bot.name} coordinate bots and propose setup changes in the teams you select.</Label>
    {choices.map(team => <Row key={team}><Label style={{ flex: 1 }}>{team || 'General'}</Label><Toggle label={`Allow access to ${team || 'General'}`} value={selected.includes(team)} disabled={disabled} onChange={checked => setSelected(current => checked ? [...current, team] : current.filter(value => value !== team))} /></Row>)}
    {!choices.length && <Label muted size={13}>Create another team to coordinate across teams.</Label>}
    <ActionRow title="Save team access" disabled={disabled || !changed} onPress={() => onSave(selected)} />
  </FormSection>;
}

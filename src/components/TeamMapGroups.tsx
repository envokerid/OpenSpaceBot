import { useRef, useState } from "react";
import { ChevronDown, MessageCircle, Monitor, Plus, Users } from "lucide-react";
import { useStore, type Bot, type Group } from "@/state/store";
import { vmAcceptsSubject, vmAssignment, vmCanAssignToGroup } from "../../shared/vm-assignment";
import { teamMapVm } from "@/lib/team-map-vms";
import type { VmLibraryPayload, VmSubject } from "../../shared/vm-library";
import { BotAvatar } from "./Avatar";

function GroupVmPicker({ group, library, busy, onVm, onAssign }: {
  group: Group; library?: VmLibraryPayload; busy: boolean;
  onVm?: (subject: VmSubject, vmId?: string, create?: boolean) => void;
  onAssign?: (groupId: string, vmId: string | null, grantGroupAccess?: boolean) => Promise<boolean>;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [pendingShare, setPendingShare] = useState<string>();
  const subject = { kind: "group" as const, id: group.id };
  const { vm, binding } = vmAssignment(library, subject);
  const locked = busy || !!group.working || !!group.busyBotId || !!vm?.inUse || vm?.operation?.state === "running";
  const choices = library?.instances.filter(item => item.id === binding?.vmId || (vmCanAssignToGroup(item, group.id) && item.state !== "missing")) ?? [];
  const availableVms = choices.filter(item => vmAcceptsSubject(item, subject));
  const pendingVm = choices.find(item => item.id === pendingShare);
  const close = () => { setPendingShare(undefined); if (menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } };
  const title = !library ? onVm ? "Loading VMs…" : "Computer settings unavailable" : vm ? vm.name : binding?.vmId ? "Assigned VM unavailable" : "Each member’s computer";
  return <details ref={menu} className="relative mt-4" onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <summary aria-label={`Choose or create a VM for ${group.name}`} className="flex w-full cursor-pointer list-none items-center gap-2 rounded-xl border border-accent/25 bg-accent/5 px-3 py-3 text-left text-[12px] hover:bg-accent/10 [&::-webkit-details-marker]:hidden">
      <Monitor size={16} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1"><span className="block break-words font-medium">{title}</span><span className="mt-0.5 block text-[11px] text-ink-secondary">{vm ? `${vm.access.mode} · ${vm.state}${vm.holder ? ` · ${vm.holder}` : ""}` : "Choose or create a group VM"}</span></span>
      <ChevronDown size={14} className="shrink-0 text-ink-secondary" />
    </summary>
    <div className="absolute inset-x-0 top-full z-20 mt-2 space-y-3 rounded-xl border border-hairline/60 bg-panel p-3 shadow-xl">
      <label className="block text-[12px] font-medium text-ink">Default VM
        <select aria-label={`VM for ${group.name}`} value={pendingVm?.id ?? binding?.vmId ?? ""} disabled={!library || !onAssign || locked}
          className="mt-2 w-full rounded-lg border border-hairline/60 bg-panel px-3 py-2 text-[13px] text-ink disabled:opacity-50"
          onChange={event => {
            const id = event.target.value || null;
            const chosen = choices.find(item => item.id === id);
            if (chosen && !vmAcceptsSubject(chosen, subject)) { setPendingShare(chosen.id); return; }
            setPendingShare(undefined);
            void onAssign?.(group.id, id).then(saved => { if (saved) close(); });
          }}>
          <option value="">Use each member’s computer</option>
          {binding?.vmId && !vm && <option value={binding.vmId} disabled>Assigned VM unavailable</option>}
          {choices.map(item => <option key={item.id} value={item.id} disabled={item.inUse || item.operation?.state === "running" || item.state === "missing" || !vmCanAssignToGroup(item, group.id)}>
            {item.name} · {item.state}{item.inUse ? " · In use" : item.operation?.state === "running" ? " · Updating" : !vmAcceptsSubject(item, subject) ? " · Share with group" : ""}
          </option>)}
        </select>
      </label>
      {pendingVm && <div className="space-y-2 rounded-lg bg-control p-3">
        <p className="text-[12px] text-ink">Share {pendingVm.name} with {group.name} and use it as the group VM?</p>
        <p className="text-[11px] text-ink-secondary">Group members will have access to its apps, files, and browser sessions inside this group. Existing bot access stays in place.</p>
        <button disabled={locked || pendingVm.inUse || pendingVm.operation?.state === "running" || !onAssign}
          className="rounded-lg bg-accent px-3 py-2 text-[12px] text-white disabled:opacity-50"
          onClick={() => void onAssign?.(group.id, pendingVm.id, true).then(saved => { if (saved) close(); })}>Share with group & assign</button>
        <button disabled={busy} className="ml-2 rounded-lg px-2 py-2 text-[12px] text-ink-secondary hover:bg-panel" onClick={() => setPendingShare(undefined)}>Cancel</button>
      </div>}
      <div className="space-y-1 text-[12px] text-ink-secondary"><p className="font-medium text-ink">VMs the group can choose</p>
        {availableVms.map(item => <button key={item.id} className="block w-full rounded px-2 py-1 text-left hover:bg-control" disabled={!onVm}
          onClick={() => { close(); onVm?.(subject, item.id); }}>{item.name}{item.id === binding?.vmId ? " · Default" : ""}</button>)}
        <button className="text-accent" disabled={!onVm} onClick={() => { close(); onVm?.(subject); }}>Manage available VMs</button>
        <p>Enable this group in each VM’s settings. Members can switch between these VMs during work.</p>
      </div>
      {locked && <p className="text-[11px] text-ink-secondary">Finish active work or release computer control before changing this assignment.</p>}
      {library && choices.length === 0 && <p className="text-[11px] text-ink-secondary">No VMs are available to this group yet.</p>}
      <button disabled={!onVm || !library || busy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-ink hover:bg-control disabled:opacity-50"
        onClick={() => { close(); onVm?.(subject, undefined, true); }}><Plus size={14} />Create new VM</button>
      {vm && <button disabled={!onVm} className="w-full rounded-lg px-3 py-2 text-left text-[12px] text-ink-secondary hover:bg-control disabled:opacity-50"
        onClick={() => { close(); onVm?.(subject, vm.id); }}>VM settings</button>}
    </div>
  </details>;
}

export function TeamMapGroups({ groups, bots, library, busy = false, onVm, onAssign }: {
  groups: Group[]; bots: Bot[]; library?: VmLibraryPayload;
  busy?: boolean;
  onVm?: (subject: VmSubject, vmId?: string, create?: boolean) => void;
  onAssign?: (groupId: string, vmId: string | null, grantGroupAccess?: boolean) => Promise<boolean>;
}) {
  const { dispatch } = useStore();
  return <div role="region" aria-label="Groups in team map" className="min-w-0 flex-1 overflow-y-auto p-6">
    <p className="mb-4 text-[12px] text-ink-secondary">Group VMs are used inside the group. Members keep their personal computer assignments in direct chats.</p>
    {!groups.length && <div className="rounded-xl border border-dashed border-hairline/60 p-8 text-center text-[13px] text-ink-secondary">No groups yet. Create a group from the sidebar to see it here.</div>}
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-5">
      {groups.map(group => {
        return <section key={group.id} aria-label={`${group.name} group`} className="rounded-2xl border border-hairline/50 bg-panel p-4">
          <header className="flex items-start gap-3">
            <Users size={20} className="mt-1 shrink-0 text-accent" />
            <div className="min-w-0 flex-1"><h2 className="break-words text-[14px] font-semibold">{group.name}</h2><p className="mt-1 text-[11px] text-ink-secondary">{group.section || "General"} · {group.memberIds.length} members{group.working || group.busyBotId ? " · Working" : ""}</p></div>
            <button className="rounded-lg p-2 text-ink-secondary hover:bg-control" aria-label={`Open ${group.name} group chat`} onClick={() => dispatch({ type: "select", id: group.id })}><MessageCircle size={15} /></button>
          </header>
          <GroupVmPicker group={group} library={library} busy={busy} onVm={onVm} onAssign={onAssign} />
          <div className="ml-4 border-l border-hairline/60 py-2">
            {group.memberIds.map(id => {
              const bot = bots.find(bot => bot.id === id);
              if (!bot) return <p key={id} className="p-3 text-[12px] text-ink-secondary">Unavailable member</p>;
              const assigned = teamMapVm(library, bot, group);
              return <div key={id} className="relative ml-4 mt-2 flex items-center gap-3 rounded-xl border border-hairline/40 bg-card p-3 before:absolute before:-left-4 before:top-1/2 before:w-4 before:border-t before:border-hairline/60">
                <BotAvatar bot={bot} size={30} animated={false} />
                <div className="min-w-0 flex-1"><button className="block truncate text-[13px] font-medium hover:text-accent" onClick={() => dispatch({ type: "select", id: bot.id })}>{bot.name}</button><p className="mt-1 break-words text-[11px] text-ink-secondary">{assigned.label === "Assign Local VM" ? "Personal computer" : assigned.label}</p></div>
              </div>;
            })}
            {!group.memberIds.length && <p className="ml-4 py-3 text-[12px] text-ink-secondary">No members assigned.</p>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}

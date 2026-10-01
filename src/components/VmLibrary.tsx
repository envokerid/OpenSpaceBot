import { useCallback, useEffect, useId, useRef, useState } from "react";
import { VmPreviewCard } from "./VmPreviewCard";
import type { VmAccess, VmInstance, VmLibraryPayload, VmSubject } from "../../shared/vm-library";

import { vmAcceptsSubject, vmAssignment, vmChoices } from "../../shared/vm-assignment";

const button = "rounded-lg border border-hairline/40 px-3 py-2 text-[13px] text-ink hover:bg-control disabled:opacity-40";
const input = "w-full rounded-lg border border-hairline/40 bg-panel px-3 py-2 text-[13px] text-ink";
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not update VMs"); return data;
}
export function useVmLibrary(enabled = true) {
  const [data, setData] = useState<VmLibraryPayload>();
  const [error, setError] = useState<string>(); const [readError, setReadError] = useState<string>(); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const next = await request<VmLibraryPayload>("/api/vms"); setData(next); setReadError(undefined); return next; }, []);
  useEffect(() => { if (!enabled) return; let alive = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { try { const next = await request<VmLibraryPayload>("/api/vms"); if (alive) { setData(next); setReadError(undefined); } } catch (error) { if (alive) setReadError(String(error)); } finally { if (alive) timer = setTimeout(poll, 5000); } };
    void poll(); return () => { alive = false; clearTimeout(timer); };
  }, [enabled]);
  const run = async (operation: () => Promise<unknown>) => { setBusy(true); setError(undefined); try { await operation(); await load(); return true; } catch (error) { setError(error instanceof Error ? error.message : String(error)); return false; } finally { setBusy(false); } };
  return { data, error: error ?? readError, busy, run, load, clearError: () => { setError(undefined); setReadError(undefined); } };
}
const grantKey = (grant: { kind: string; id: string }) => `${grant.kind}:${grant.id}`;
const eligible = vmAcceptsSubject;

function Assignment({ data, subject, busy, save }: { data: VmLibraryPayload; subject: VmSubject; busy: boolean; save: (vmId: string | null) => void }) {
  const value = data.bindings.find(binding => binding.kind === subject.kind && binding.id === subject.id)?.vmId ?? "";
  const selected = data.instances.find(vm => vm.id === value);
  return <div className="space-y-2"><label className="block text-[13px] text-ink">{subject.kind === "group" ? "Default group VM" : subject.kind === "default" ? "Workspace default VM" : "Default Local VM"}
    <select className={input} value={value} disabled={busy} onChange={event => save(event.target.value || null)}>
      <option value="">{subject.kind === "group" ? "Use each bot's computer" : subject.kind === "default" ? "No default VM" : "Use workspace default"}</option>
      {data.instances.filter(vm => eligible(vm, subject) || vm.id === value).map(vm => <option key={vm.id} value={vm.id}>{vm.name} · {vm.access.mode} · {vm.state}{vm.inUse ? " · In use" : ""}</option>)}
    </select></label>
    <p className="text-[12px] text-ink-secondary">{subject.kind === "group" && value ? "Members use this desktop in this group. Direct chats keep their own settings." : "The bot can choose any VM it has access to. This sets its starting default."}</p>
    {selected?.holder && <p className="text-[12px] text-ink-secondary">In use by {selected.holder}</p>}
  </div>;
}

export function ChatVmList({ data, subject, threadId }: { data: VmLibraryPayload; subject: VmSubject; threadId?: string }) {
  const choices = vmChoices(data, subject);
  const defaultId = vmAssignment(data, subject).binding?.vmId;
  const selectedId = data.bindings.find(binding => binding.kind === "task" && binding.id === threadId)?.vmId ?? defaultId;
  return <section aria-label={subject.kind === "group" ? "Group Local VMs" : "Bot Local VMs"}>
    <h3 className="text-[13px] font-medium">Local VMs <span className="text-ink-secondary">({choices.length})</span></h3>
    <div className="mt-2 space-y-3" aria-label="Available VM previews">
      {choices.map(vm => <VmPreviewCard key={`${subject.kind}:${subject.id}:${vm.id}`} vm={vm} subject={subject} selected={vm.id === selectedId} isDefault={vm.id === defaultId} />)}
    </div>
    {!choices.length && <p className="mt-2 text-[12px] text-ink-secondary">No VMs are available to this {subject.kind === "group" ? "group" : "bot"}.</p>}
    {selectedId && !choices.some(vm => vm.id === selectedId) && <p className="mt-2 text-[12px] text-warning">The selected VM is missing or access has been removed.</p>}
  </section>;
}

export function VmAssignment({ subject, threadId }: { subject: VmSubject; threadId?: string }) {
  const { data, error, busy, run } = useVmLibrary();
  return <div className="space-y-2 border-b border-hairline/30 px-4 py-3 text-[13px] text-ink">
    {error && <p role="alert" className="text-danger">{error}</p>}
    {data ? <ChatVmList data={data} subject={subject} threadId={threadId} /> : <p className="text-ink-secondary">Loading Local VMs…</p>}
    <details><summary className="cursor-pointer text-[12px] text-ink-secondary">Default VM settings</summary>
      <div className="mt-2">{data && <Assignment data={data} subject={subject} busy={busy} save={vmId => void run(() => request(`/api/computer-bindings/${subject.kind}/${subject.id}`, "PUT", { vmId, revision: data.revision }))} />}</div>
      <p className="mt-2 text-[12px] text-ink-secondary">Create VMs and manage sharing in App Settings → Computers.</p>
    </details>
  </div>;
}

export function VmAssignments({ data, vm, busy, focusSubject, save, grant }: {
  data: VmLibraryPayload; vm: VmInstance; busy: boolean; focusSubject?: VmSubject;
  save: (subject: VmSubject, checked: boolean) => void;
  grant: (subject: VmSubject, checked: boolean) => void;
}) {
  const locked = busy || vm.inUse || vm.operation?.state === "running";
  const isDefault = data.bindings.some(binding => binding.kind === "default" && binding.vmId === vm.id);
  return <fieldset className="space-y-3 border-t border-hairline/30 pt-3" disabled={locked}>
    <legend className="text-[13px] font-medium text-ink">Available to bots & groups</legend>
    <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={isDefault}
      disabled={locked || vm.access.mode !== "shared"} onChange={event => save({ kind: "default", id: "workspace" }, event.target.checked)} />Workspace default VM</label>
    <p className="text-[12px] text-ink-secondary">{vm.access.mode === "isolated" ? "Only shared VMs can be the workspace default." : "Bots with access inherit this VM when they have no personal assignment."}</p>
    <div className="max-h-64 space-y-2 overflow-y-auto">{data.subjects.map(subject => {
      const current = data.bindings.find(binding => grantKey(binding) === grantKey(subject));
      const checked = current?.vmId === vm.id;
      const previous = data.instances.find(item => item.id === current?.vmId);
      const allowed = eligible(vm, subject);
      return <div key={grantKey(subject)} className={`flex items-start gap-2 rounded p-1 text-[13px] text-ink ${focusSubject && grantKey(focusSubject) === grantKey(subject) ? "bg-accent/10" : ""}`}>
        <label className="flex flex-1 items-start gap-2"><input type="checkbox" className="mt-1" checked={allowed}
          disabled={locked || vm.access.allBots || vm.access.mode === "isolated" || checked}
          onChange={event => grant(subject, event.target.checked)} />
        <span>{subject.name} · {subject.kind}<span className="block text-[11px] text-ink-secondary">{checked ? "Default VM" : allowed ? previous ? `Available · Default: ${previous.name}` : "Available for the bot to choose" : "No access"}</span></span></label>
        {allowed && <button className="shrink-0 rounded px-2 py-1 text-[11px] text-accent hover:bg-panel" disabled={locked}
          onClick={() => save(subject, !checked)}>{checked ? "Clear default" : "Make default"}</button>}
      </div>;
    })}</div>
    {!data.subjects.length && <p className="text-[12px] text-ink-secondary">Create a bot or group before assigning it.</p>}
    <p className="text-[12px] text-ink-secondary">Enable any number of VMs for a bot or group. The bot can choose among them during work; one VM remains the default. Clear a default before removing its access. Isolated ownership is changed in Name & access. Computer Off is respected.</p>
  </fieldset>;
}

export type VmLibraryRequest = { nonce: number; vmId?: string; subject?: VmSubject; create?: boolean };
export function VmLibraryPanel() {
  const library = useVmLibrary();
  return <VmLibraryContent library={library} />;
}

type VmForm = { id?: string; name: string; access: VmAccess; requestId: string; revision: number };
type Library = ReturnType<typeof useVmLibrary>;

function VmEditor({ form, setForm, data, busy, submit, cancel }: {
  form: VmForm; setForm: (form: VmForm) => void; data: VmLibraryPayload; busy: boolean;
  submit: (start: boolean) => void; cancel: () => void;
}) {
  const ownerName = useId();
  const changeGrant = (key: string) => {
    const grant = data.subjects.find(item => grantKey(item) === key);
    if (!grant) return;
    const checked = form.access.grants.some(item => grantKey(item) === key);
    setForm({ ...form, access: { ...form.access, grants: form.access.mode === "isolated"
      ? [{ kind: grant.kind, id: grant.id }]
      : checked ? form.access.grants.filter(item => grantKey(item) !== key)
      : [...form.access.grants, { kind: grant.kind, id: grant.id }] } });
  };
  return <form className="rounded-lg border border-hairline/40 p-3 space-y-3" onSubmit={event => {
    event.preventDefault(); submit((event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") !== "stopped");
  }}>
    <h4 className="text-ink">{form.id ? "Edit VM" : "New VM"}</h4>
    <label className="block text-[13px] text-ink">Name<input autoFocus className={input} value={form.name} maxLength={80} required onChange={event => setForm({ ...form, name: event.target.value })} /></label>
    <label className="block text-[13px] text-ink">Access<select className={input} value={form.access.mode} onChange={event => setForm({ ...form, access: { mode: event.target.value as VmAccess["mode"], grants: [] } })}><option value="shared">Shared with selected bots/groups</option><option value="isolated">Isolated for one bot/group</option></select></label>
    {form.access.mode === "shared" && <label className="flex gap-2 text-[13px] text-ink"><input type="checkbox" checked={!!form.access.allBots} onChange={event => setForm({ ...form, access: { ...form.access, allBots: event.target.checked } })} />All current and future bots</label>}
    <div className="flex flex-wrap gap-3">{data.subjects.map(item => <label key={grantKey(item)} className="flex gap-2 text-[13px] text-ink"><input type={form.access.mode === "isolated" ? "radio" : "checkbox"} name={ownerName} checked={form.access.grants.some(grant => grantKey(grant) === grantKey(item))} onChange={() => changeGrant(grantKey(item))} />{item.name} · {item.kind}</label>)}</div>
    <p className="text-[12px] text-ink-secondary">Sharing gives access to this desktop's apps, files, and browser sessions. Isolated group VMs are accessible only inside that group.</p>
    <div className="flex gap-2 flex-wrap"><button className={button} disabled={busy} type="submit" value="running">{form.id ? "Save" : "Create & start"}</button>{!form.id && <button className={button} disabled={busy} type="submit" value="stopped">Create stopped</button>}<button className={button} disabled={busy} type="button" onClick={cancel}>Cancel</button></div>
  </form>;
}

function VmLibraryItem({ vm, data, library, selection, createdId }: {
  vm: VmInstance; data: VmLibraryPayload; library: Library; selection?: VmLibraryRequest; createdId?: string;
}) {
  const { busy, run } = library;
  const [open, setOpen] = useState(selection?.vmId === vm.id || createdId === vm.id);
  const [form, setForm] = useState<VmForm>();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const settingsId = useId();
  useEffect(() => { if (selection?.vmId === vm.id) setOpen(true); }, [selection?.nonce, selection?.vmId, vm.id]);
  useEffect(() => { if (createdId === vm.id) setOpen(true); }, [createdId, vm.id]);
  const act = (action: string) => void run(() => request(`/api/vms/${vm.id}/actions`, "POST", {
    action, requestId: crypto.randomUUID(), revision: data.revision, ...(action === "delete" ? { confirmName: confirm } : {}),
  }));
  const locked = busy || vm.inUse || vm.operation?.state === "running";
  return <article className="py-3" aria-label={vm.name}>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-[14px] text-ink break-words">{vm.name}</h4>
        <p className="text-[12px] text-ink-secondary">{vm.access.mode} · {vm.operation?.state === "running" ? `${vm.operation.action} in progress` : vm.state} · {vm.holder ?? "Available"}</p>
        <p className="text-[12px] text-ink-secondary">{vm.assignments.map(binding => data.subjects.find(s => grantKey(s) === grantKey(binding))?.name ?? (binding.kind === "default" ? "Workspace default" : binding.kind)).join(", ") || "Unassigned"}</p>
        {vm.operation?.state === "failed" && <p className="text-[12px] text-danger">{vm.operation.error}</p>}
      </div>
      <button className={button} onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={settingsId} aria-label={`Settings for ${vm.name}`}>{open ? "Hide settings" : "Settings"}</button>
    </div>
    <div id={settingsId} hidden={!open} className="mt-3 rounded-lg bg-control p-3 space-y-3">{open && <>
      <p className="text-[12px] text-ink-secondary">2 CPUs · 4 GiB memory · Created {new Date(vm.createdAt).toLocaleDateString()}</p>
      <p className="text-[13px] text-ink-secondary">Access: {vm.access.allBots ? "All bots (including future bots)" : vm.access.grants.map(grant => data.subjects.find(s => grantKey(s) === grantKey(grant))?.name ?? "Deleted owner").join(", ") || "Unassigned"}</p>
      {vm.problem && <p className="text-[12px] text-warning">{vm.problem}</p>}
      <VmAssignments data={data} vm={vm} busy={busy} focusSubject={selection?.subject}
        grant={(subject, checked) => {
          if (subject.kind !== "bot" && subject.kind !== "group") return;
          const grants = vm.access.grants.filter(item => grantKey(item) !== grantKey(subject));
          if (checked) grants.push({ kind: subject.kind, id: subject.id });
          void run(() => request(`/api/vms/${vm.id}`, "PATCH", { revision: data.revision, access: { ...vm.access, grants } }));
        }}
        save={(subject, checked) => void run(() => request(`/api/computer-bindings/${subject.kind}/${subject.id}`, "PUT", { revision: data.revision, vmId: checked ? vm.id : null }))} />
      <div className="flex flex-wrap gap-2">
        {vm.canRetryCreate && <button className={button} disabled={locked} onClick={() => act("create")}>Retry creation</button>}
        <button className={button} disabled={locked || !data.available || vm.state === "missing"} onClick={() => act(vm.state === "running" ? "stop" : "start")}>{vm.state === "running" ? "Stop" : "Start"}</button>
        <button className={button} disabled={locked || vm.state !== "running"} onClick={() => act("reconnect")}>Reconnect control</button>
        {vm.canRecreate && <button className={button} disabled={locked || !data.available} onClick={() => act("recreate")}>Recreate · keep apps & files</button>}
        <button className={button} disabled={locked} onClick={() => setForm({ id: vm.id, name: vm.name, access: structuredClone(vm.access), requestId: crypto.randomUUID(), revision: data.revision })}>Name & access</button>
        <button className={button} disabled={locked} onClick={() => setDeleting(true)}>Delete…</button>
      </div>
      {vm.canRecreate && <p className="text-[12px] text-ink-secondary">Recreate restarts the desktop and keeps installed apps, files, settings, and assignments. Save any open work first. A recovery copy is retained.</p>}
      {form && <VmEditor form={form} setForm={setForm} data={data} busy={locked} cancel={() => setForm(undefined)} submit={() => void run(async () => {
        await request(`/api/vms/${vm.id}`, "PATCH", { name: form.name, access: form.access, revision: form.revision }); setForm(undefined);
      })} />}
      {deleting && <div className="space-y-2"><p className="text-[13px] text-danger">Delete {vm.name}? The active VM disk will be deleted. Its workspace folder and any earlier recovery copies remain. {vm.assignments.length} assignments will be cleared.</p><label className="block text-[13px] text-ink">Type the VM name<input className={input} value={confirm} onChange={event => setConfirm(event.target.value)} /></label><button className={button} disabled={locked || confirm !== vm.name} onClick={() => act("delete")}>Delete VM</button></div>}
      <details><summary className="text-[13px] text-ink cursor-pointer">Activity</summary>{vm.activity.slice(-10).reverse().map((event, i) => <p key={i} className="text-[12px] text-ink-secondary">{new Date(event.at).toLocaleString()} · {event.message}</p>)}</details>
    </>}
    </div>
  </article>;
}

export function VmLibraryContent({ library, selection }: { library: Library; selection?: VmLibraryRequest }) {
  const { data, error, busy, run, load } = library;
  const [createdId, setCreatedId] = useState<string>();
  const [form, setForm] = useState<VmForm>();
  const handledRequest = useRef<number | undefined>(undefined);
  const newForm = (): VmForm => ({ name: "", access: selection?.subject && (selection.subject.kind === "bot" || selection.subject.kind === "group")
    ? { mode: "isolated", grants: [{ kind: selection.subject.kind, id: selection.subject.id }] }
    : { mode: "shared", grants: [] }, requestId: crypto.randomUUID(), revision: data!.revision });
  useEffect(() => {
    if (!data || !selection || handledRequest.current === selection.nonce) return;
    handledRequest.current = selection.nonce;
    setForm(selection.create ? newForm() : undefined);
  }, [selection, data]);
  return <section className="rounded-xl border border-hairline/40 bg-panel p-4 space-y-4" aria-label="Local VM library">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[15px] font-medium text-ink">Local VMs</h3><div className="flex gap-2"><button className={button} disabled={busy} onClick={() => void run(load)}>Refresh</button><button className={button} disabled={busy || !data} onClick={() => setForm(newForm())}>New VM</button></div></div>
    {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
    {!data ? <p className="text-ink-secondary">Loading saved VMs…</p> : <>
      {selection?.subject && <p className="text-[13px] text-ink">Expand each VM to give access to <strong>{data.subjects.find(item => grantKey(item) === grantKey(selection.subject!))?.name ?? selection.subject.kind}</strong>. Enable several choices and choose one default.</p>}
      {data.problem && <p className="text-[13px] text-warning">{data.problem}</p>}
      <p className="text-[12px] text-ink-secondary">{data.instances.filter(vm => vm.state === "running").length} running · {data.instances.length} saved · running limit {data.limits.running}. Apps and files remain when stopped.</p>
      <div className="divide-y divide-hairline/30">{data.instances.map(vm => <VmLibraryItem key={vm.id} vm={vm} data={data} library={library} selection={selection} createdId={createdId} />)}</div>
      {data.instances.length === 0 && <p className="text-[13px] text-ink-secondary">No saved VMs. Prepare the image below, then create a desktop.</p>}
      {form && <VmEditor form={form} setForm={setForm} data={data} busy={busy} cancel={() => setForm(undefined)} submit={start => void run(async () => {
        const created = await request<{ operation: { id: string } }>("/api/vms", "POST", { name: form.name, access: form.access, requestId: form.requestId, start });
        const updated = await load(); setCreatedId(updated.instances.find(item => item.operation?.id === created.operation.id)?.id); setForm(undefined);
      })} />}
      <details><summary className="cursor-pointer text-[13px] text-ink">Capacity limits</summary><form key={`${data.limits.saved}:${data.limits.running}`} className="mt-3 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); void run(() => request("/api/vms/limits", "PATCH", { revision: data.revision, saved: Number(values.get("saved")), running: Number(values.get("running")) })); }}><label className="text-[13px] text-ink">Saved VMs<input className={input} type="number" min={1} max={1000} name="saved" defaultValue={data.limits.saved} required /></label><label className="text-[13px] text-ink">Running VMs<input className={input} type="number" min={1} max={1000} name="running" defaultValue={data.limits.running} required /></label><button className={button} disabled={busy}>Save limits</button></form></details>
    </>}
  </section>;
}

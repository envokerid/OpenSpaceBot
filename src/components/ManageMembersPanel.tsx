// Group details edit the roster and room judge atomically.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { track } from "@/lib/analytics";
import { api, useStore, type Group } from "@/state/store";
import { BotPickerList } from "./BotPickerList";
import type { ModelSelection } from "../../shared/wire";
import { nextMemberIds } from "@/lib/room-members";

export function ManageMembersPanel({
  group,
  onClose,
  triggerRef,
}: {
  group: Group;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { state, dispatch } = useStore();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(group.memberIds));
  const [judge, setJudge] = useState<ModelSelection | null>(group.judgeModelSelection ?? null);
  const openedJudge = useRef(group.judgeModelSelection ?? null);
  const judgeChanged = JSON.stringify(judge) !== JSON.stringify(openedJudge.current);
  const judgeInstances = state.instances.filter(i => i.capabilities?.agentsMcp);
  const judgeInstance = judgeInstances.find(i => i.instanceId === judge?.instanceId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const openedMemberIds = useRef([...group.memberIds]);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Archived bots stay listed while they are still members — otherwise a
  // room could keep a member you have no way to remove.
  const bots = useMemo(
    () => state.bots.filter((b) => !b.hidden || group.memberIds.includes(b.id)),
    [state.bots, group.memberIds],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = () =>
      [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
        (element) => !element.hasAttribute("hidden"),
      );
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pending.current) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return event.preventDefault();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKey);
    return () => {
      dialog.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [onClose, triggerRef]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const memberIds = nextMemberIds(
    group.memberIds,
    picked,
    bots.map((b) => b.id),
  );
  const changed = memberIds.length !== group.memberIds.length || memberIds.some((id, i) => id !== group.memberIds[i]);

  const save = async () => {
    if (!memberIds.length || pending.current) return;
    const opened = openedMemberIds.current;
    const rosterChanged =
      opened.length !== group.memberIds.length || opened.some((id, index) => id !== group.memberIds[index]);
    if (rosterChanged) {
      setSaveError("This group's members changed while the panel was open. Close it and try again.");
      return;
    }
    if (changed || judgeChanged) {
      pending.current = true;
      setSaving(true);
      setSaveError(null);
      try {
        const result = await api<{ group: Group }>(`/api/groups/${group.id}/members`, {
          method: "PATCH",
          body: JSON.stringify({ memberIds, expectedMemberIds: opened, ...(judgeChanged ? { judgeModelSelection: judge, expectedJudgeModelSelection: openedJudge.current } : {}) }),
        });
        dispatch({ type: "groupPatched", group: result.group });
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Could not save members. Try again.");
        return;
      } finally {
        pending.current = false;
        setSaving(false);
      }
      track("room_members_changed", {
        members: memberIds.length,
        added: memberIds.filter((id) => !group.memberIds.includes(id)).length,
        removed: group.memberIds.filter((id) => !memberIds.includes(id)).length,
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => e.target === e.currentTarget && !pending.current && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Manage members of ${group.name}`}
        className="w-[340px] rounded-2xl border border-hairline/50 bg-card p-4 shadow-2xl"
      >
        <div className="mb-1 text-[15px] font-semibold text-ink">Manage Members</div>
        <div className="mb-3 truncate text-[13px] text-ink-secondary">{group.name}</div>
        <BotPickerList bots={bots} picked={picked} onToggle={toggle} disabled={saving} emptyHint="Create a bot first — groups are made of bots." />
        {!memberIds.length && <div className="mt-2 text-[12px] text-ink-secondary">A group needs at least one bot.</div>}
        <fieldset disabled={saving || group.working} className="mt-4 space-y-2 text-sm">
          <legend className="font-semibold text-ink">Room judge</legend>
          <label className="block">Judge provider
            <select aria-label="Judge provider" className="mt-1 w-full rounded-lg bg-inset p-2" value={judge?.instanceId ?? ""}
              onChange={event => { const instance = judgeInstances.find(i => i.instanceId === event.target.value); setJudge(instance ? { instanceId: instance.instanceId, model: instance.models.default } : null); }}>
              <option value="">Automatic · first active member’s model</option>
              {judge && !judgeInstance && <option value={judge.instanceId}>{judge.instanceId} (unavailable)</option>}
              {judgeInstances.map(i => <option key={i.instanceId} value={i.instanceId}>{i.displayName}</option>)}
            </select>
          </label>
          {judge && <label className="block">Judge model
            <select aria-label="Judge model" className="mt-1 w-full rounded-lg bg-inset p-2" value={judge.model}
              onChange={event => setJudge({ instanceId: judge.instanceId, model: event.target.value })}>
              {!judgeInstance?.models.options.some(m => m.id === judge.model) && <option value={judge.model}>{judge.model}</option>}
              {judgeInstance?.models.options.map(m => <option key={m.id} value={m.id}>{m.label ?? m.id}</option>)}
            </select>
          </label>}
          <p className="text-xs text-ink-secondary">Members submit reasons and ready-made replies in parallel. The judge reads the chat history and selects the next message to post.</p>
        </fieldset>
        {saveError && (
          <div role="alert" className="mt-2 text-[12px] text-danger">
            {saveError}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg bg-raised py-2 text-[14px] font-medium text-ink hover:brightness-110"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!memberIds.length || saving}
            className="flex-1 rounded-lg bg-accent py-2 text-[14px] font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}{memberIds.length ? ` · ${memberIds.length} ${memberIds.length === 1 ? "bot" : "bots"}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

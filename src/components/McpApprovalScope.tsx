import { useState } from "react";
import { api, useStore } from "@/state/store";
import type { ApprovedCommandsResponse } from "../../shared/approved-commands";
import { BotAvatar } from "./Avatar";

export function McpApprovalScope({ tool, botId, onApprove }: { tool: string; botId?: string; onApprove: () => void }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ApprovedCommandsResponse>();
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<string[]>(botId ? [botId] : []);
  const [includeNewBots, setIncludeNewBots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setOpen(true); setBusy(true); setError("");
    try { setData(await api("/api/settings/approved-commands")); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  if (!open) return <button className="rounded-full border border-hairline/50 px-3.5 py-1.5 text-[13.5px] text-ink hover:bg-control" onClick={() => void load()}>Approve for bots…</button>;
  return <div className="w-full rounded-xl border border-hairline/40 bg-inset p-3 text-[13px] text-ink">
    <p className="mb-3 text-ink-secondary">Always approve this MCP tool for the bots you choose. This also allows the current request once.</p>
    <fieldset disabled={busy} className="space-y-3">
      <label className="flex items-center gap-2"><input type="radio" checked={!all} onChange={() => setAll(false)} />Selected bots</label>
      <label className="flex items-center gap-2"><input type="radio" checked={all} onChange={() => setAll(true)} />All current bots</label>
      {all ? <label className="flex items-center gap-2 pl-5"><input type="checkbox" checked={includeNewBots} onChange={e => setIncludeNewBots(e.target.checked)} />Also approve for all new bots</label>
        : <div className="max-h-48 overflow-y-auto space-y-2">{data?.bots.map(bot => <label key={bot.id} className="flex items-center gap-3">
          <input type="checkbox" checked={selected.includes(bot.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, bot.id] : ids.filter(id => id !== bot.id))} />
          <BotAvatar bot={state.bots.find(profile => profile.id === bot.id) ?? { name: bot.name, color: "green" }} size={28} animated={false} trackPointer={false} />
          {bot.name}
        </label>)}</div>}
      <div className="flex justify-end gap-2">
        <button className="ui-button" onClick={() => setOpen(false)}>Cancel</button>
        {!data ? <button className="ui-button" onClick={() => void load()}>Retry</button> : <button className="ui-button" disabled={!all && !selected.length} onClick={async () => {
          setBusy(true); setError("");
          try {
            await api("/api/settings/approved-commands", { method: "PATCH", body: JSON.stringify({ tool, approved: true, ...(all ? { allBots: true, includeNewBots } : { botIds: selected }) }) });
            onApprove(); setOpen(false);
          } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Save and approve</button>}
      </div>
    </fieldset>
    {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
  </div>;
}

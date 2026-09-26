import { useEffect, useState } from "react";
import { ChevronDown, Terminal } from "lucide-react";
import { api, type Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { mcpApprovalKey, mcpToolApproved, type ApprovedCommandsResponse } from "../../shared/approved-commands";
import { Switch } from "./SettingsPrimitives";
import { BotAvatar } from "./Avatar";

export function ApprovedCommandsSettings({ bots = [] }: { bots?: Bot[] }) {
  const [data, setData] = useState<ApprovedCommandsResponse>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const load = async () => {
    setError("");
    setBusy(true);
    try { setData(await api("/api/settings/approved-commands")); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const tools = [...new Set([...(data?.tools ?? []), ...added])].sort().filter(name => name.toLowerCase().includes(query.toLowerCase()));
  const inputClass = "w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none";
  return <>
    <p className="text-[13px] text-ink-secondary">{t("settings.approvedCommands.description")}</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <button className="ui-button self-start" disabled={busy} onClick={() => void load()}>{t("settings.approvedCommands.refresh")}</button>
    {!data && !error && <p>{t("settings.approvedCommands.loading")}</p>}
    <input className={inputClass} aria-label={t("settings.approvedCommands.search")} placeholder={t("settings.approvedCommands.search")} value={query} onChange={e => setQuery(e.target.value)} />
    <form className="flex flex-wrap gap-2" onSubmit={e => {
      e.preventDefault();
      const key = mcpApprovalKey(tool.trim());
      if (!key) { setError(t("settings.approvedCommands.invalid")); return; }
      setAdded(previous => [...new Set([...previous, key])]); setTool(""); setQuery(""); setError("");
    }}>
      <input className={`${inputClass} min-w-0 flex-1`} aria-label={t("settings.approvedCommands.toolName")} placeholder="mcp__server__tool" value={tool} onChange={e => setTool(e.target.value)} />
      <button type="submit" className="ui-button" disabled={!tool.trim()}>{t("settings.approvedCommands.add")}</button>
    </form>
    {data && !data.bots.length && <p>{t("settings.approvedCommands.noBots")}</p>}
    {data && !tools.length && <p>{t("settings.approvedCommands.noTools")}</p>}
    {data && tools.map(name => <details key={name} className="group overflow-hidden rounded-xl border border-hairline/40 bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-ink hover:bg-control/40 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <Terminal size={16} className="shrink-0 text-ink-secondary" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-all font-mono text-[13px] font-medium">{name}</span>
        <ChevronDown size={16} className="shrink-0 text-ink-secondary group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-hairline/40 bg-inset px-4 py-1">
      <label className="flex items-center gap-3 border-b border-hairline/30 py-3 text-[13px] text-ink-secondary">
        <input type="checkbox" checked={mcpToolApproved(data.newBotApprovals, name)} disabled={busy} onChange={async e => {
          const includeNewBots = e.target.checked;
          setBusy(true); setError("");
          try { setData(await api("/api/settings/approved-commands", { method: "PATCH", body: JSON.stringify({ tool: name, botIds: [], approved: true, includeNewBots }) })); }
          catch (e) { setError(String(e)); }
          finally { setBusy(false); }
        }} />Also approve for all new bots
      </label>
      {data.bots.map(bot => <div key={bot.id} className="flex items-center gap-3 border-t border-hairline/30 py-3 first:border-t-0">
        <BotAvatar bot={bots.find(profile => profile.id === bot.id) ?? { name: bot.name, color: "green" }} size={32} animated={false} trackPointer={false} />
        <span className="min-w-0 flex-1 break-words text-[14px] text-ink">{bot.name}</span>
        <Switch aria-label={`${bot.name}: ${name}`} checked={mcpToolApproved(bot.approvals, name)} disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try { setData(await api("/api/settings/approved-commands", { method: "PATCH", body: JSON.stringify({ botId: bot.id, tool: name, approved: !mcpToolApproved(bot.approvals, name) }) })); }
          catch (e) { setError(String(e)); }
          finally { setBusy(false); }
        }} />
      </div>)}
      </div>
    </details>)}
  </>;
}

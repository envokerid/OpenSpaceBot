import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { api, useStore, type Bot } from "@/state/store";
import { preloadConnectedApps, type ConnectorInventory } from "./PluginsPanel";

function useAccountApproval() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = async (botId: string, slug: string, accountId: string, approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/bots/${encodeURIComponent(botId)}/connector-accounts/${encodeURIComponent(slug)}/${encodeURIComponent(accountId)}`, { method: approve ? "POST" : "DELETE" });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally { setBusy(false); }
  };
  return { busy, error, update };
}

const buttonClass = "rounded-md p-1.5 text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-40";

/** Shown under each named account in the connectors panel. */
export function AccountBots({ slug, account }: { slug: string; account: { id: string; alias?: string; status: string } }) {
  const { state } = useStore();
  const { busy, error, update } = useAccountApproval();
  const [adding, setAdding] = useState(false);
  const bots = state.bots.filter((bot) => !bot.hidden);
  const approved = bots.filter((bot) => bot.connectorAccounts?.[slug]?.includes(account.id));
  const available = bots.filter((bot) => !bot.connectorAccounts?.[slug]?.includes(account.id));
  const label = account.alias || account.id;
  return <div className="mt-2 text-[12px]">
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-ink-secondary">Approved bots</span>
      {approved.map((bot) => <span key={bot.id} className="inline-flex max-w-full items-center rounded-lg bg-inset pl-2 text-ink">
        <span className="truncate">{bot.name}{bot.connectors === false ? " (disabled)" : ""}</span>
        <button type="button" className={buttonClass} disabled={busy} aria-label={`Remove ${bot.name} from ${label}`} onClick={() => void update(bot.id, slug, account.id, false)}><X size={12} /></button>
      </span>)}
      {!approved.length && <span className="text-ink-secondary">None</span>}
      <button type="button" className={buttonClass} disabled={busy || !/^active$/i.test(account.status)} aria-label={`Add bots to ${label}`} aria-expanded={adding} onClick={() => setAdding(!adding)}><Plus size={14} /></button>
    </div>
    {adding && <div className="mt-2 rounded-lg border border-hairline p-2">
      {!available.length ? <p className="text-ink-secondary">All bots are approved.</p> : available.map((bot) => <button key={bot.id} type="button" disabled={busy} className="flex w-full items-center gap-2 rounded p-2 text-left text-ink hover:bg-control disabled:opacity-40" onClick={async () => { if (await update(bot.id, slug, account.id, true)) setAdding(false); }}><Plus size={13} />{bot.name}</button>)}
    </div>}
    {busy && <Loader2 size={13} className="mt-1 animate-spin" />}
    {error && <p role="alert" className="mt-1 text-danger">{error}</p>}
  </div>;
}

/** Account assignment in the bot's settings sidebar. */
export function BotConnectorAccounts({ bot }: { bot: Bot }) {
  const [inventory, setInventory] = useState<ConnectorInventory | null>(null);
  const [adding, setAdding] = useState(false);
  const { busy, error, update } = useAccountApproval();
  useEffect(() => {
    let cancelled = false;
    void preloadConnectedApps(true).then((result) => { if (!cancelled) setInventory(result); });
    return () => { cancelled = true; };
  }, [bot.id, adding]);
  const entries = Object.entries(bot.connectorAccounts ?? {}).flatMap(([slug, ids]) => ids.map((id) => ({ slug, id })));
  const available = inventory?.authoritative ? Object.entries(inventory.services).flatMap(([slug, service]) => (service.accounts ?? [])
    .filter((account) => /^active$/i.test(account.status) && !bot.connectorAccounts?.[slug]?.includes(account.id))
    .map((account) => ({ slug, ...account }))) : [];
  return <div className="mt-3 border-t border-hairline pt-3">
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-medium text-ink">Approved accounts</span>
      <button type="button" className={buttonClass} aria-label="Add connector account" aria-expanded={adding} disabled={busy} onClick={() => setAdding(!adding)}><Plus size={16} /></button>
    </div>
    {!entries.length && <p className="mt-1 text-[12px] text-ink-secondary">No accounts approved. Add an account to let this bot use it.</p>}
    {entries.map(({ slug, id }) => {
      const account = inventory?.services[slug]?.accounts?.find((item) => item.id === id);
      return <div key={`${slug}/${id}`} className="mt-2 flex items-center gap-2 rounded-lg bg-inset px-2 py-1 text-[12px] text-ink">
        <span className="min-w-0 flex-1 break-words">{slug} · {account?.alias || id}{inventory?.authoritative && (!account || !/^active$/i.test(account.status)) ? " (unavailable)" : ""}</span>
        <button type="button" className={buttonClass} disabled={busy} aria-label={`Remove ${slug} ${account?.alias || id}`} onClick={() => void update(bot.id, slug, id, false)}><X size={13} /></button>
      </div>;
    })}
    {adding && <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-hairline p-2 text-[12px]">
      {!inventory ? <p>Loading accounts…</p> : !inventory.authoritative ? <p role="alert">Could not load accounts. Close and reopen this picker to retry.</p> : !available.length ? <p className="text-ink-secondary">No more connected accounts. Connect an app below first.</p> : available.map((account) => <button key={`${account.slug}/${account.id}`} type="button" disabled={busy} className="flex w-full items-center gap-2 rounded p-2 text-left text-ink hover:bg-control disabled:opacity-40" onClick={async () => { if (await update(bot.id, account.slug, account.id, true)) setAdding(false); }}><Plus size={13} /><span className="min-w-0 break-words">{account.slug} · {account.alias || account.id}<span className="block text-[10px] text-ink-secondary">{account.id}</span></span></button>)}
    </div>}
    {busy && <Loader2 size={13} className="mt-1 animate-spin" />}
    {error && <p role="alert" className="mt-1 text-[12px] text-danger">{error}</p>}
  </div>;
}

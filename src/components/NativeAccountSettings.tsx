import { useEffect, useState } from "react";
import { api, useStore, type InstanceInfo } from "@/state/store";
import { t } from "@/lib/i18n";
import { NATIVE_PROVIDERS, nativeAuthorizationLink, nativeProvider } from "../../shared/native-providers";
import type { DeviceSignInStatus } from "./CodexDeviceSignIn";
import { ConfirmDialog } from "./ConfirmDialog";

export function NativeAccountSettings({ instance }: { instance: InstanceInfo }) {
  const { refreshInstances, refreshModels } = useStore();
  const [provider, setProvider] = useState("openai-codex");
  const [auth, setAuth] = useState<DeviceSignInStatus | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const spec = nativeProvider(provider);
  const connected = instance.nativeAccounts?.some(row => row.provider === provider && row.connected);
  const base = `/api/instances/${encodeURIComponent(instance.instanceId)}/auth`;
  const waiting = auth?.phase === "waiting";
  const link = nativeAuthorizationLink(provider, auth?.authorizationUrl ?? null);
  const refresh = async () => { await refreshInstances(); await refreshModels(instance.instanceId); };

  useEffect(() => {
    if (!waiting || !auth?.flowId || busy) return;
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      void api(`${base}/status?flowId=${encodeURIComponent(auth.flowId!)}`, { signal: abort.signal })
        .then(async ({ auth: next }: { auth: DeviceSignInStatus }) => {
          if (abort.signal.aborted) return;
          setAuth(next);
          if (next.phase === "succeeded") { await refreshInstances(); await refreshModels(instance.instanceId); }
        }).catch(cause => {
          if (abort.signal.aborted) return;
          setError(cause instanceof Error ? cause.message : t("nativeAgent.failed"));
          setAuth(null);
        });
    }, 2000);
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [auth, base, busy, waiting, refreshInstances, refreshModels, instance.instanceId]);

  const perform = async (action: "start" | "complete" | "cancel" | "sign-out") => {
    if (busy) return;
    setBusy(true); setError(""); setConfirm(false);
    try {
      const result = await api(`${base}/${action}`, { method: "POST", body: JSON.stringify({ provider, ...(auth?.flowId ? { flowId: auth.flowId } : {}), ...(action === "complete" ? { code: secret } : {}) }) });
      if (action === "start") setAuth(result.auth);
      else setAuth(null);
      if (action !== "start" || result.auth.phase === "succeeded") await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("nativeAgent.failed")); }
    finally { setSecret(""); setBusy(false); }
  };
  const terminalMessage = auth && !waiting && auth.phase !== "succeeded" ? auth.message || t("nativeAgent.failed") : "";
  return <div className="mt-3 space-y-3">
    <p className="text-[12px] leading-relaxed text-ink-secondary">{t("nativeAgent.description")}</p>
    <label className="block text-[12px] text-ink-secondary">
      {t("nativeAgent.provider")}
      <select aria-label={t("nativeAgent.provider")} value={provider} disabled={busy || waiting} onChange={event => { setProvider(event.target.value); setAuth(null); setSecret(""); setError(""); }} className="mt-1 block w-full rounded-md border border-hairline bg-inset px-2 py-2 text-ink">
        {NATIVE_PROVIDERS.map(row => <option key={row.id} value={row.id}>{row.name}{instance.nativeAccounts?.some(account => account.provider === row.id && account.connected) ? ` · ${t("nativeAgent.saved")}` : ""}</option>)}
      </select>
    </label>
    {connected && !waiting ? <div className="flex items-center justify-between gap-2">
      <p role="status" className="text-[12px] text-success">{t("nativeAgent.accountSaved", { name: spec.name })}</p>
      <button type="button" disabled={busy} onClick={() => setConfirm(true)} className="text-[12px] text-danger">{t("nativeAgent.disconnect")}</button>
    </div> : !waiting && <button type="button" disabled={busy} onClick={() => void perform("start")} className="rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50">{t("nativeAgent.connect", { name: spec.name })}</button>}
    {waiting && <div className="space-y-2 rounded-md border border-hairline p-3">
      {auth?.userCode && <code className="block select-all text-lg text-ink">{auth.userCode}</code>}
      {link && <a href={link} target="_blank" rel="noopener noreferrer" className="block text-[12px] text-accent underline">{t("nativeAgent.open", { name: spec.name })}</a>}
      {spec.auth === "device-code" ? <p role="status" className="text-[12px] text-ink-secondary">{t("nativeAgent.waiting")}</p> : <form onSubmit={event => { event.preventDefault(); void perform("complete"); }} className="space-y-2">
        <label className="block text-[12px] text-ink-secondary">{t(spec.auth === "api-key" ? "nativeAgent.apiKey" : "nativeAgent.code")}
          <input type="password" autoComplete="off" spellCheck={false} value={secret} onChange={event => setSecret(event.target.value)} disabled={busy} className="mt-1 block w-full rounded-md border border-hairline bg-inset px-2 py-2 text-ink" />
        </label>
        <button type="submit" disabled={busy || !secret.trim()} className="rounded-md bg-accent px-3 py-2 text-[12px] text-white disabled:opacity-50">{t("nativeAgent.save")}</button>
      </form>}
      <button type="button" disabled={busy} onClick={() => void perform("cancel")} className="text-[12px] text-ink-secondary">{t("common.cancel")}</button>
    </div>}
    {(error || terminalMessage) && <p role="alert" className="text-[12px] text-danger">{error || terminalMessage}</p>}
    <ConfirmDialog open={confirm} title={t("nativeAgent.disconnectTitle", { name: spec.name })} body={t("nativeAgent.disconnectHint")} confirmLabel={t("nativeAgent.disconnect")} onCancel={() => setConfirm(false)} onConfirm={() => void perform("sign-out")} />
  </div>;
}

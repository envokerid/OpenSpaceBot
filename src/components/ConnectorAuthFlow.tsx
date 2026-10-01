import { useEffect, useState } from "react";
import { api } from "@/state/store";
import { connectorAuthFinished, type ConnectorAuthState } from "../../shared/connector-auth";

export function ConnectorAuthFlow({ initial, onDone, onClose }: { initial: ConnectorAuthState; onDone(): void; onClose(): void }) {
  const [state, setState] = useState(initial);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setState(initial); setValues({}); setError("");
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next: ConnectorAuthState = await api(`/api/connectors/auth/${initial.id}`);
        if (!active) return;
        setState(next); setError("");
        if (connectorAuthFinished(next)) {
          if (next.kind === "connected") onDone();
          return;
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Could not check this connection"); }
      if (active) timer = setTimeout(poll, 2_000);
    };
    timer = setTimeout(poll, 500);
    return () => { active = false; clearTimeout(timer); };
  // The session ID is the identity; parent render callbacks must not restart polling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id]);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      setState(await api(`/api/connectors/auth/${state.id}`, { method: "POST", body: JSON.stringify(values) }));
      setValues({});
    } catch (e) { setError(e instanceof Error ? e.message : "Connection failed"); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await api(`/api/connectors/auth/${state.id}`, { method: "DELETE" }); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not cancel"); }
    finally { setBusy(false); }
  };
  const open = async () => {
    if (!state.url) return;
    const url = new URL(state.url);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) { setError("Invalid authorization link"); return; }
    if (window.ogb?.openExternal) await window.ogb.openExternal(url.href);
    else window.open(url.href, "_blank", "noopener,noreferrer");
  };
  return <section aria-label={`Connect ${state.slug}`} className="m-4 space-y-3 rounded-xl border border-hairline bg-inset p-4 text-sm">
    <div className="font-semibold">Connect {state.slug}{state.alias ? ` · ${state.alias}` : ""}</div>
    {state.kind === "pending" && <p role="status">Preparing the connection…</p>}
    {state.kind === "form" && <form onSubmit={e => { e.preventDefault(); void submit(); }} className="space-y-3">
      {state.fields?.map(field => <label key={field.key} className="block">{field.label}
        <input autoComplete="off" type={field.secret ? "password" : "text"} required value={values[field.key] ?? ""} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))} className="mt-1 block w-full rounded border border-hairline bg-base p-2" />
      </label>)}
      {state.helpUrl && <a href={state.helpUrl} target="_blank" rel="noreferrer" className="underline">Provider setup instructions</a>}
      <button disabled={busy} className="rounded bg-control px-3 py-2">Connect</button>
    </form>}
    {state.kind === "browser" && <>
      <button onClick={() => void open().catch(() => setError("Could not open the sign-in link"))} className="rounded bg-control px-3 py-2">Open sign-in link</button>
      <p>Complete sign-in in your browser, then return here.</p>
      {state.manualCallback && <form onSubmit={e => { e.preventDefault(); void submit(); }} className="space-y-2">
        <label className="block">If the localhost page cannot open on this device, copy its complete address from the browser and paste it here.
          <input type="password" autoComplete="off" required value={values.callbackUrl ?? ""} onChange={e => setValues({ callbackUrl: e.target.value })} className="mt-1 block w-full rounded border border-hairline bg-base p-2" />
        </label>
        <button disabled={busy} className="rounded bg-control px-3 py-2">Finish sign-in</button>
      </form>}
    </>}
    {state.kind === "qr" && <>
      <p>Open the provider app on your phone and scan this code from its linked-devices screen. Keep this page open while pairing.</p>
      {state.qrDataUrl?.startsWith("data:image/png;base64,") && <img src={state.qrDataUrl} width={256} height={256} alt={`Pair ${state.slug}`} className="max-w-full rounded bg-white p-3" />}
    </>}
    {state.kind === "connected" && <p role="status">Connected. Use the account’s bot access controls to choose which bots may use it.</p>}
    {(state.error || error) && <p role="alert" className="text-danger">{error || state.error}</p>}
    {connectorAuthFinished(state) ? <button onClick={onClose} className="rounded bg-control px-3 py-2">Close</button> : <button disabled={busy} onClick={() => void cancel()} className="underline">Cancel connection</button>}
  </section>;
}

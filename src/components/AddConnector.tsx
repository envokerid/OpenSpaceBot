import { useState } from "react";
import { api } from "@/state/store";

export function AddConnector({ onAdded }: { onAdded(): void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState("oauth");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="mx-6 my-2 text-sm underline">Add remote MCP integration</button>;
  return <form className="m-4 space-y-2 rounded-xl border border-hairline p-4 text-sm" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/connectors/providers", { method: "POST", body: JSON.stringify({ slug, label, url, auth, ...(clientId ? { clientId } : {}) }) });
      setOpen(false); setLabel(""); setSlug(""); setUrl(""); setClientId(""); onAdded();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add this integration"); }
    finally { setBusy(false); }
  }}>
    <p>Add the provider’s Streamable HTTP MCP endpoint. Each connection will have its own credentials and bot access grants.</p>
    {[["Name", label, setLabel], ["ID (lowercase, numbers, hyphens)", slug, setSlug], ["MCP server URL", url, setUrl]] .map(([title, value, change]) => <label key={String(title)} className="block">{String(title)}<input required value={String(value)} onChange={e => (change as (s: string) => void)(e.target.value)} className="block w-full rounded border border-hairline bg-base p-2" /></label>)}
    <label className="block">Authentication <select value={auth} onChange={e => setAuth(e.target.value)} className="rounded bg-control p-2"><option value="oauth">Browser OAuth</option><option value="token">Access token</option><option value="none">No authentication</option></select></label>
    {auth === "oauth" && <label className="block">OAuth client ID (optional; otherwise use dynamic registration)<input value={clientId} onChange={e => setClientId(e.target.value)} className="block w-full rounded border border-hairline bg-base p-2" /></label>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    <button disabled={busy} className="rounded bg-control px-3 py-2">Add integration</button>{" "}<button type="button" onClick={() => setOpen(false)}>Cancel</button>
  </form>;
}

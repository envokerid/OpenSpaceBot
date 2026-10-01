import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { VmInstance, VmSubject } from "../../shared/vm-library";

export function vmViewerPath(vmId: string, subject: VmSubject, action: "screen" | "control") {
  return `/api/vms/${encodeURIComponent(vmId)}/${action}?${new URLSearchParams({ kind: subject.kind, subjectId: subject.id })}`;
}
async function read<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "VM connection failed");
  return result;
}

/** Each preview and viewer is pinned to an instance, never to a mutable default. */
export function VmPreviewCard({ vm, subject, selected, isDefault }: {
  vm: VmInstance; subject: VmSubject; selected: boolean; isDefault: boolean;
}) {
  const [frame, setFrame] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [pending, setPending] = useState(false);
  const [held, setHeld] = useState(false);
  const [webViewer, setWebViewer] = useState<string>();
  const [lease] = useState(() => crypto.randomUUID());
  const alive = useRef(true);
  const heldRef = useRef(false);
  const screenPath = vmViewerPath(vm.id, subject, "screen");
  const controlPath = vmViewerPath(vm.id, subject, "control");
  const context = `vm-preview:${vm.id}:${subject.kind}:${subject.id}:${lease}`;
  const control = (action: "take" | "renew" | "release") => read<{ held: boolean; viewerUrl?: string }>(controlPath, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, controlLeaseId: lease }), keepalive: action === "release", signal: AbortSignal.timeout(15_000),
  });
  const release = async () => {
    await control("release");
    heldRef.current = false;
    if (alive.current) { setHeld(false); setWebViewer(undefined); }
  };
  useEffect(() => {
    alive.current = true;
    const stop = window.ogb?.desktopViewer?.onState(state => {
      if (!state.open && state.contextId === context) void release().catch(() => {});
    });
    return () => {
      alive.current = false;
      stop?.();
      void window.ogb?.desktopViewer?.close(context).catch(() => {});
      void release().catch(() => {});
    };
  }, [context, controlPath]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (document.visibilityState === "hidden") return;
        if (vm.state !== "running") { setFrame(undefined); return; }
        const result = await read<{ image: string | null; problem: string | null }>(screenPath, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (controller.signal.aborted) return;
        if (result.image) {
          // Decode before swapping: the previous frame stays painted while the
          // next screenshot arrives, including during temporary capture errors.
          const image = new Image(); image.src = result.image; await image.decode();
          if (!controller.signal.aborted) setFrame(result.image);
        }
        if (!controller.signal.aborted) setProblem(result.problem ?? undefined);
      } catch (error) {
        if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : String(error));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, document.visibilityState === "hidden" ? 2000 : 500);
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [screenPath, vm.state]);
  useEffect(() => {
    if (!held) return;
    const timer = setInterval(() => void control("renew").catch(error => {
      void window.ogb?.desktopViewer?.close(context).catch(() => {});
      void release().catch(() => {});
      if (alive.current) { setProblem(error.message); setHeld(false); setWebViewer(undefined); }
    }), 15_000);
    return () => clearInterval(timer);
  }, [held, controlPath, context]);
  const take = async () => {
    if (pending) return;
    setPending(true); setProblem(undefined);
    try {
      const result = await control("take");
      heldRef.current = true;
      if (!alive.current) { await release(); return; }
      if (!result.viewerUrl) throw new Error("The VM did not provide a viewer connection");
      if (window.ogb?.desktopViewer) {
        if (!await window.ogb.desktopViewer.open(result.viewerUrl, vm.name, context)) throw new Error("Could not open this VM's viewer");
        if (!alive.current) { await window.ogb.desktopViewer.close(context); await release(); return; }
      } else setWebViewer(result.viewerUrl);
      setHeld(true);
    } catch (error) {
      if (heldRef.current) await release().catch(() => {});
      if (alive.current) setProblem(error instanceof Error ? error.message : String(error));
    } finally { if (alive.current) setPending(false); }
  };
  return <article aria-label={`${vm.name} live preview`} className="space-y-2 rounded-xl border border-hairline/40 bg-panel p-3">
    <header className="flex flex-wrap items-center gap-2 text-[13px]"><h4 className="min-w-0 flex-1 break-words font-medium">{vm.name}</h4>
      {selected && <span className="text-[11px] text-accent">Selected for chat</span>}{isDefault && <span className="text-[11px] text-ink-secondary">Default</span>}
    </header>
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-card">
      {frame ? <img src={frame} alt={`Live desktop of ${vm.name}`} className="h-full w-full object-contain" /> : <span className="p-4 text-center text-[12px] text-ink-secondary">{vm.state === "running" ? "Connecting live preview…" : `VM ${vm.state}`}</span>}
      {frame && !problem && <span className="absolute right-2 top-2 rounded bg-black/65 px-2 py-0.5 text-[10px] text-white">Live</span>}
    </div>
    <p className="text-[11px] text-ink-secondary">{vm.access.mode} · {vm.state}{held ? " · You control it" : vm.holder ? ` · ${vm.holder}` : ""}</p>
    {problem && <p role="status" className="text-[11px] text-warning">{problem}</p>}
    <button type="button" disabled={pending || (!held && (vm.state !== "running" || vm.operation?.state === "running"))}
      className="w-full rounded-lg bg-control px-3 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:opacity-40"
      aria-label={`${held ? "Return control of" : "Take control of"} ${vm.name}`}
      onClick={() => held ? void (async () => { setPending(true); try { await window.ogb?.desktopViewer?.close(context); await release(); } catch (error) { setProblem(String(error)); } finally { if (alive.current) setPending(false); } })() : void take()}>
      {pending ? "Connecting…" : held ? "Return control" : "Take control"}
    </button>
    {webViewer && createPortal(<div role="dialog" aria-modal="true" aria-label={`${vm.name} desktop`} className="fixed inset-0 z-50 flex flex-col bg-panel p-3">
      <button className="self-end rounded-lg bg-control px-4 py-2 text-ink" onClick={() => void release().catch(error => setProblem(error.message))}>Return control & close</button>
      <iframe title={`${vm.name} interactive desktop`} src={webViewer} className="mt-2 min-h-0 w-full flex-1 border-0" />
    </div>, document.body)}
  </article>;
}

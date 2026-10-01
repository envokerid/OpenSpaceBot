"use client";

import { useEffect, useId, useState } from "react";

export default function CopySystemPrompt({ name, prompt }: { name: string; prompt: string }) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);
  const tooltipId = useId();

  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 3000);
    return () => clearTimeout(timer);
  }, [status]);

  async function copyPrompt() {
    if (status === "copying") return;
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      className="teammate-prompt"
      data-dismissed={dismissed}
      onMouseEnter={() => setDismissed(false)}
      onFocus={() => setDismissed(false)}
      onKeyDown={(event) => { if (event.key === "Escape") setDismissed(true); }}
    >
      <button
        className="copy-prompt-button"
        type="button"
        onClick={copyPrompt}
        aria-disabled={status === "copying"}
        aria-label={`Copy ${name}'s system prompt`}
        aria-describedby={tooltipId}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {status === "copied" ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" /></>}
        </svg>
      </button>
      <p className="copy-prompt-status" role="status">
        {status === "copied" ? "Copied. Paste into your bot’s system instructions." : status === "error" ? "Couldn’t copy. Select and copy the prompt in the tooltip." : ""}
      </p>
      <div className="prompt-tooltip" id={tooltipId} role="tooltip" tabIndex={0}>
        {status === "error" && <p className="prompt-copy-error">Couldn’t copy. Select and copy this prompt manually.</p>}
        <p>{prompt}</p>
      </div>
    </div>
  );
}

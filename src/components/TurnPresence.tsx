// The animated mascot represents work in progress. A completed reply
// settles into the transcript above it.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function TurnPresence({
  avatar,
  visible,
  label = "Thinking",
  answering = false,
}: {
  avatar: ReactNode;
  visible: boolean;
  label?: string;
  answering?: boolean;
}) {
  const [mounted, setMounted] = useState(visible);
  const [phase, setPhase] = useState<"think" | "answer" | "out">(answering ? "answer" : "think");
  const wasAnswering = useRef(answering);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setPhase(answering ? "answer" : "think");
      wasAnswering.current = answering;
      return;
    }
    if (!mounted) return;
    const handoff = wasAnswering.current;
    wasAnswering.current = false;
    if (handoff) {
      setMounted(false);
      return;
    }
    setPhase("out");
    const timer = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(timer);
  }, [visible, answering, mounted]);

  if (!mounted) return null;
  const showWorking = phase === "think";
  return (
    <div className="turn-presence flex flex-col items-start">
      <div
        className={cn(
          "flex items-center gap-2",
          phase === "think" && "turn-mascot-in",
          phase === "out" && "turn-mascot-out",
        )}
      >
        {avatar}
        {showWorking ? (
          <span className="sr-only" role="status">{label}</span>
        ) : null}
      </div>
    </div>
  );
}

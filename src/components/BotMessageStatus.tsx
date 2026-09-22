import { useEffect, useState } from "react";
import { messageDay } from "../../shared/message-day";
import { activeLocale, t } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export function MessageDay({ at }: { at: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current.getTime());
      const midnight = new Date(current);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(update, midnight.getTime() - current.getTime() + 50);
    };
    update();
    window.addEventListener("focus", update);
    return () => { clearTimeout(timer); window.removeEventListener("focus", update); };
  }, []);
  return messageDay(at, now, activeLocale(), {
    today: t("chat.day.today"), yesterday: t("chat.day.yesterday"),
  });
}

export function UnreadLight({ className }: { className?: string }) {
  return <span
    aria-label={t("task.unreadMany")}
    className={cn("inline-block size-[9px] shrink-0 rounded-full border border-[#93C5FD] bg-[#3B82F6]", className)}
    style={{ boxShadow: "0 0 5px 1px rgba(59, 130, 246, 0.65), 0 0 10px 2px rgba(59, 130, 246, 0.25)" }}
  />;
}

import type { MascotState } from "./mascot-appearance.ts";

export type MascotMessage = {
  id?: string; at?: number; role?: string; kind: string;
  turnTerminal?: boolean; queued?: boolean; via?: string;
  peerAsk?: { botId: string }; from?: { botId: string };
  tool?: { ok?: boolean; name?: string };
};

export type MascotBotProfile = {
  name: string;
  id?: string; threadId?: string;
  waitingForTeammates?: boolean;
  typing?: boolean; reasoning?: boolean;
  title?: string;
  description?: string;
  mascotExpression?: string | null;
  busy?: boolean;
  activity?: string;
  unread?: boolean;
  messages?: MascotMessage[];
};

/** Live signals take priority over decorative/resting expressions. */
export function liveStateForBot(bot: MascotBotProfile): MascotState | null {
  const last = bot.messages?.findLast(message => message.kind !== "digest" && message.kind !== "compaction");
  if (bot.activity === "dead") return "alerting";
  if (bot.activity === "waiting-on-you") return "listening";
  if (bot.waitingForTeammates) return "orbit";
  if (bot.typing) return "writing";
  if (bot.reasoning) return "thinking";
  if (last?.kind === "activity" && last.tool?.ok === false) return "alerting";
  if (bot.busy || bot.activity === "working") {
    if (last?.kind === "activity" && last.tool?.ok === undefined && /search|browse|fetch|find|research/i.test(last.tool?.name ?? "")) return "searching";
    return "working";
  }
  if (bot.unread) return "notifying";
  if (last?.kind === "options") return "curious";
  return null;
}

/** Automatic activity/profile state, without a manually selected expression. */
export function automaticStateForBot(bot: MascotBotProfile): MascotState {
  const live = liveStateForBot(bot);
  if (live) return live;
  const profile = `${bot.name} ${bot.title ?? ""} ${bot.description ?? ""}`.toLowerCase();
  const matches = (words: RegExp) => words.test(profile);

  if (matches(/\b(code|coding|developer|development|engineer|engineering|build|debug|program|software)\b/)) {
    return "working";
  }
  if (matches(/\b(research|researcher|search|investigate|strategy|strategist|study|learn|knowledge)\b/)) {
    return "searching";
  }
  if (matches(/\b(marketing|growth|launch|campaign|social|sales|outreach|brand)\b/)) {
    return "excited";
  }
  if (matches(/\b(overnight|night|background|async|queue|batch|long-running)\b/)) {
    return "drowsy";
  }
  if (matches(/\b(monitor|monitoring|incident|alert|watch|status|uptime)\b/)) {
    return "radar";
  }
  if (matches(/\b(review|reviewer|audit|critic|critique|quality|qa|test|legal)\b/)) {
    return "suspicious";
  }
  if (matches(/\b(security|secure|compliance|risk|privacy|finance|financial)\b/)) {
    return "scared";
  }
  if (matches(/\b(design|designer|creative|brainstorm|art|illustration|music|story)\b/)) {
    return "playful";
  }
  if (matches(/\b(support|help|success|onboarding|coach|teacher|guide|welcome)\b/)) {
    return "happy";
  }

  return "idle";
}

import { normalizeState } from "../../shared/mascot-appearance";
import { CURSOR_STATES, type CursorState } from "@/components/CursorAvatar";
import { automaticStateForBot, type MascotBotProfile } from "../../shared/mascot-state";
export type { MascotBotProfile } from "../../shared/mascot-state";

/** The mascot's behaviour vocabulary — CursorAvatar's 39 states, under the
 * app's historical names. */
export type MausState = CursorState;
export const MAUS_STATES = CURSOR_STATES;

/** CursorAvatar ships French group labels; the app shows these instead. The
 * memberships mirror its STATE_GROUPS exactly. */
export const STATE_GROUPS = {
  Lifecycle: ["sleeping", "waking", "idle", "listening", "thinking", "searching", "working"],
  Reactions: [
    "excited",
    "surprised",
    "suspicious",
    "angry",
    "drowsy",
    "happy",
    "curious",
    "confused",
    "bored",
    "proud",
    "shy",
    "sad",
    "laughing",
    "scared",
    "playful",
    "celebrate",
  ],
  "Agent morphs": ["orbit", "radar", "progress"],
  "Product cycle": [
    "spawning",
    "humming",
    "loading",
    "dictating",
    "writing",
    "sending",
    "receiving",
    "uploading",
    "notifying",
    "alerting",
    "dragging",
    "bouncing",
    "powering-down",
  ],
} satisfies Record<string, MausState[]>;

export { MAUS_COLOR_NAMES, MAUS_COLORS, type MausColor, PICKABLE_STATES, normalizeState } from "../../shared/mascot-appearance";
export const MAUS_MOTIONS = [
  "arrive",
  "switch",
  "customize",
  "alert",
  "thinking",
  "working",
  "launch",
  "success",
  "celebrate",
  "blink",
  "surprise",
  "failure",
] as const;

export type MausMotion = "none" | (typeof MAUS_MOTIONS)[number];

/** Desktop retains compatibility with saved expression overrides. */
export function stateForBot(bot: MascotBotProfile): MausState {
  return normalizeState(bot.mascotExpression) ?? automaticStateForBot(bot);
}

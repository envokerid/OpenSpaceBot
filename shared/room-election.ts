import type { ModelSelection } from "./wire.ts";

/** Persisted discussion audit trail. Members retain their own drafts; the judge retains all drafts and reasons. */
export interface RoomElectionChoice {
  botId: string;
  candidate: string;
  reason?: string;
  message?: string;
}

export interface RoomElectionMember {
  id: string;
  name: string;
  title?: string;
}

export interface RoomElectionRound {
  round: number;
  revision: string;
  members: RoomElectionMember[];
  order: string[];
  proposals: RoomElectionChoice[];
  /** Legacy ballots; new rounds leave this empty. */
  votes: RoomElectionChoice[];
  winner?: string;
  /** Set only after the selected draft has actually been appended to chat. */
  postedMessageId?: string;
  judge?: { selection: ModelSelection; tiedCandidates: string[]; candidates?: string[]; candidate?: string; reason?: string };
  constrainedChoices?: string[];
  superseded?: boolean;
}

export interface RoomElectionData {
  /** The receipt of the explicitly resumed run; prevents retry replays. */
  resumedBy?: string;
  phase: "proposing" | "voting" | "judging" | "waiting" | "speaking" | "completed" | "paused" | "stopped";
  rounds: RoomElectionRound[];
  sourceMessageId: string;
}

export const ROOM_TASK_COMPLETE = "task_complete";

/** Selection keeps working without a public provider turn or an elected speaker. */
export function roomSelectionPending(messages: ReadonlyArray<{ goalRun?: { status: string; election?: Pick<RoomElectionData, "phase"> } }>): boolean {
  const run = messages.findLast(message => message.goalRun?.election)?.goalRun;
  return run?.status === "working" && ["proposing", "voting", "judging"].includes(run.election!.phase);
}

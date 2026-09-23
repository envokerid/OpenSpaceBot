/** Durable progress receipt for one goal-driven channel run. */
export type GroupGoalRunStatus =
  | "working"
  | "completed"
  | "needs-input"
  | "blocked"
  | "limit-reached"
  /** The operator (or a guard) parked the run; resumable once a resume path exists. */
  | "paused"
  | "stopped"
  | "failed";

export interface GroupGoalRunCardData {
  /** Shared-room proposal/vote run; absent on historical coordinator runs. */
  election?: import("./room-election.ts").RoomElectionData;
  runId: string;
  goal: string;
  status: GroupGoalRunStatus;
  coordinatorBotId: string;
  coordinatorName: string;
  turnCount: number;
  maxTurns: number;
  detail?: string;
  startedAt: number;
  finishedAt?: number;
}

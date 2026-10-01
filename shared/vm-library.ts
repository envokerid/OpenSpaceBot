/** Public VM inventory. Never contains viewer credentials or host paths. */
export type VmSubject = { kind: "bot" | "group" | "task" | "default"; id: string };
export type VmGrant = { kind: "bot" | "group"; id: string };
export type VmAccess = { mode: "shared" | "isolated"; grants: VmGrant[]; allBots?: boolean };
export type VmBinding = VmSubject & { vmId: string | null };
export type VmOperation = { id: string; requestId: string; action: "create" | "start" | "stop" | "reconnect" | "recreate" | "delete"; state: "running" | "completed" | "failed"; startedAt: number; endedAt?: number; error?: string };
export type VmEvent = { at: number; message: string };
export interface VmInstance {
  id: string;
  name: string;
  access: VmAccess;
  createdAt: number;
  lastUsedAt?: number;
  revision: number;
  state: "unknown" | "missing" | "running" | "stopped";
  ready: boolean;
  canRetryCreate?: boolean;
  canRecreate?: boolean;
  problem: string | null;
  inUse: boolean;
  holder: string | null;
  operation?: VmOperation;
  activity: VmEvent[];
  assignments: VmBinding[];
}
export interface VmLibraryPayload {
  instances: VmInstance[];
  bindings: VmBinding[];
  subjects: (VmGrant & { name: string })[];
  limits: { saved: number; running: number };
  revision: number;
  available: boolean;
  problem: string | null;
}

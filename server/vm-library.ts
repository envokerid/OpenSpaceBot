import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeFileAtomic } from "./atomic.ts";
import type { VmAccess, VmGrant, VmOperation, VmSubject } from "../shared/vm-library.ts";

const id = z.string().regex(/^[\w-]+$/).max(160);
export const vmGrantSchema = z.object({ kind: z.enum(["bot", "group"]), id }).strict();
export const vmAccessSchema = z.object({ mode: z.enum(["shared", "isolated"]), grants: z.array(vmGrantSchema).max(500), allBots: z.boolean().optional() }).strict().refine(value => value.mode !== "isolated" || (value.grants.length <= 1 && !value.allBots), "An isolated VM has one owner");
const bindingSchema = z.object({ kind: z.enum(["bot", "group", "task", "default"]), id, vmId: id.nullable() }).strict();
const operationSchema = z.object({ id, requestId: id, action: z.enum(["create", "start", "stop", "reconnect", "recreate", "delete"]), state: z.enum(["running", "completed", "failed"]), startedAt: z.number(), endedAt: z.number().optional(), error: z.string().optional() });
const recordSchema = z.object({ id, name: z.string().trim().min(1).max(80), access: vmAccessSchema, createdAt: z.number(), lastUsedAt: z.number().optional(), revision: z.number().int(), creationRequestId: id.optional(), startRequested: z.boolean().optional(), creationComplete: z.boolean().optional(), receipts: z.array(operationSchema).default([]), target: z.discriminatedUnion("kind", [z.object({ kind: z.literal("shared") }), z.object({ kind: z.literal("bot"), botId: id }), z.object({ kind: z.literal("instance"), id })]), operation: operationSchema.optional(), activity: z.array(z.object({ at: z.number(), message: z.string() })), deleted: z.boolean().optional() });
const stateSchema = z.object({ version: z.literal(1), revision: z.number().int(), legacyMode: z.enum(["shared", "per-bot"]), migrated: z.boolean(), limits: z.object({ saved: z.number().int().min(1).max(1000), running: z.number().int().min(1).max(1000) }), instances: z.array(recordSchema), bindings: z.array(bindingSchema) });
export type VmRecord = z.infer<typeof recordSchema>;
type State = z.infer<typeof stateSchema>;
export type VmContext = { botId: string; threadId?: string; groupId?: string; memberIds?: string[] };
const fail = (message: string, status = 409) => Object.assign(new Error(message), { status });
const same = (a: VmSubject, b: VmSubject) => a.kind === b.kind && a.id === b.id;

/** Atomic registry independent of bot lifetime. Runtime observations stay outside
 * this file; an unavailable daemon must never erase a retained desktop. */
export class VmLibrary {
  private state: State;
  private path: string;
  constructor(path: string, mode: "shared" | "per-bot", limit: number) {
    this.path = path;
    this.state = existsSync(path) ? stateSchema.parse(JSON.parse(readFileSync(path, "utf8"))) : { version: 1, revision: 0, legacyMode: mode, migrated: false, limits: { saved: Math.max(2, limit), running: Math.max(2, limit) }, instances: [], bindings: [] };
    // A server crash cannot leave a permanent running operation. Retain its
    // exact target for reconciliation/retry, never mint a replacement ID.
    if (this.state.instances.some(vm => vm.operation?.state === "running")) this.change(state => {
      for (const vm of state.instances) if (vm.operation?.state === "running") {
        vm.operation.state = "failed"; vm.operation.endedAt = Date.now();
        vm.operation.error = "The server restarted during this operation. Inspect the retained VM and retry.";
      }
    });
  }
  private change(edit: (state: State) => void) {
    const next = structuredClone(this.state); edit(next); next.revision++;
    stateSchema.parse(next);
    writeFileAtomic(this.path, JSON.stringify(next, null, 2), { mode: 0o600 });
    this.state = next;
  }
  snapshot() { return structuredClone(this.state); }
  list() { return this.snapshot().instances.filter(vm => !vm.deleted); }
  get(id: string) { return this.list().find(vm => vm.id === id); }
  binding(subject: VmSubject) { return this.state.bindings.find(binding => same(binding, subject)); }
  private event(vm: VmRecord, message: string) { vm.activity = [...vm.activity, { at: Date.now(), message }].slice(-100); vm.revision++; }
  adoptLegacy(bot?: { id: string; name: string }) {
    const vmId = bot ? `legacy-bot-${bot.id}` : "legacy-shared";
    // Tombstones keep discovery from resurrecting explicitly deleted VMs.
    if (this.state.instances.some(vm => vm.id === vmId)) return this.get(vmId);
    this.change(state => {
      state.instances.push({ id: vmId, name: bot ? `${bot.name} desktop` : "Shared desktop", access: bot ? { mode: "isolated", grants: [{ kind: "bot", id: bot.id }] } : { mode: "shared", grants: [], allBots: true }, target: bot ? { kind: "bot", botId: bot.id } : { kind: "shared" }, createdAt: Date.now(), revision: 1, receipts: [], activity: [{ at: Date.now(), message: "Existing VM registered without replacement" }] });
      const subject: VmSubject = bot ? { kind: "bot", id: bot.id } : { kind: "default", id: "workspace" };
      if ((bot ? state.legacyMode === "per-bot" : state.legacyMode === "shared") && !state.bindings.some(binding => same(binding, subject))) state.bindings.push({ ...subject, vmId });
      state.limits.saved = Math.max(state.limits.saved, state.instances.filter(vm => !vm.deleted).length);
    });
    return this.get(vmId);
  }
  finishMigration(running = 0) { if (!this.state.migrated) this.change(state => { state.migrated = true; state.limits.running = Math.max(state.limits.running, running); }); }
  allowed(vm: VmRecord, context: VmContext) {
    // Group grants are contextual; membership never grants access in direct chat.
    if (context.groupId && !context.memberIds?.includes(context.botId)) return false;
    return vm.access.allBots === true || vm.access.grants.some(grant => grant.kind === "bot" ? grant.id === context.botId : grant.id === context.groupId && context.memberIds?.includes(context.botId));
  }
  resolve(context: VmContext): { vm: VmRecord; source: VmSubject["kind"] } | null {
    const subjects: VmSubject[] = [
      ...(context.threadId ? [{ kind: "task" as const, id: context.threadId }] : []),
      ...(context.groupId ? [{ kind: "group" as const, id: context.groupId }] : []),
      { kind: "bot", id: context.botId }, { kind: "default", id: "workspace" },
    ];
    for (const subject of subjects) {
      const binding = this.binding(subject);
      if (!binding?.vmId) continue;
      const vm = this.get(binding.vmId);
      if (!vm || !this.allowed(vm, context)) throw fail("The selected VM is missing or this conversation no longer has access", 403);
      return { vm, source: subject.kind };
    }
    return null;
  }
  create(name: string, access: VmAccess, requestId: string, start = true) {
    const duplicate = this.state.instances.find(vm => vm.creationRequestId === requestId);
    if (duplicate) return structuredClone(duplicate);
    if (this.list().length >= this.state.limits.saved) throw fail("Saved VM limit reached. Raise the limit or explicitly delete an unused VM.");
    const vmId = randomUUID();
    const vm: VmRecord = recordSchema.parse({ id: vmId, name, access, creationRequestId: requestId, startRequested: start, target: { kind: "instance", id: vmId }, createdAt: Date.now(), revision: 1, activity: [{ at: Date.now(), message: "VM creation requested" }], operation: { id: randomUUID(), requestId, action: "create", state: "running", startedAt: Date.now() } });
    this.change(state => { state.instances.push(vm); }); return structuredClone(vm);
  }
  assertRevision(revision: number) { if (revision !== this.state.revision) throw fail("VM settings changed. Refresh before saving."); }
  edit(vmId: string, patch: { name?: string; access?: VmAccess }, revision: number) {
    this.assertRevision(revision);
    if (!this.get(vmId)) throw fail("No such VM", 404);
    this.change(state => { const vm = state.instances.find(vm => vm.id === vmId)!; Object.assign(vm, patch); this.event(vm, "VM settings updated"); });
  }
  bind(subject: VmSubject, vmId: string | null, revision: number, grantGroupAccess = false) {
    this.assertRevision(revision);
    if (vmId && !this.get(vmId)) throw fail("No such VM", 404);
    if (grantGroupAccess && (subject.kind !== "group" || !vmId || this.get(vmId)?.access.mode !== "shared")) throw fail("Only shared VMs can grant access to a group during assignment", 400);
    this.change(state => {
      const shared = state.instances.find(vm => vm.id === vmId);
      if (grantGroupAccess && shared && !shared.access.allBots && !shared.access.grants.some(grant => same(grant, subject))) {
        shared.access.grants.push({ kind: "group", id: subject.id });
        this.event(shared, `Access granted to group ${subject.id}`);
      }
      state.bindings = state.bindings.filter(binding => !same(binding, subject));
      if (vmId) state.bindings.push({ ...subject, vmId });
      const vm = state.instances.find(vm => vm.id === vmId);
      if (vm) this.event(vm, `Assigned to ${subject.kind} ${subject.id}`);
    });
  }
  setLimits(limits: State["limits"], revision: number) {
    this.assertRevision(revision);
    if (limits.saved < this.list().length) throw fail("The saved limit cannot be below the retained VM count");
    this.change(state => { state.limits = limits; });
  }
  begin(vmId: string, action: VmOperation["action"], requestId: string, revision: number) {
    const vm = this.get(vmId); if (!vm) throw fail("No such VM", 404);
    const prior = vm.receipts.find(receipt => receipt.requestId === requestId) ?? (vm.operation?.requestId === requestId ? vm.operation : undefined);
    if (prior) return prior;
    this.assertRevision(revision);
    if (vm.operation?.state === "running") throw fail("A VM operation is already running");
    const operation: VmOperation = { id: randomUUID(), requestId, action, state: "running", startedAt: Date.now() };
    this.change(state => { const record = state.instances.find(vm => vm.id === vmId)!; record.operation = operation; this.event(record, `${action} requested`); }); return operation;
  }
  finish(vmId: string, error?: string) {
    this.change(state => {
      const vm = state.instances.find(vm => vm.id === vmId)!;
      if (!vm.operation) return;
      vm.operation.state = error ? "failed" : "completed"; vm.operation.endedAt = Date.now(); vm.operation.error = error;
      vm.receipts = [...vm.receipts.filter(receipt => receipt.requestId !== vm.operation!.requestId), structuredClone(vm.operation)].slice(-100);
      if (!error && vm.operation.action === "create") vm.creationComplete = true;
      this.event(vm, error ? `${vm.operation.action} failed: ${error}` : `${vm.operation.action} completed`);
      if (!error && vm.operation.action === "delete") {
        vm.deleted = true; state.bindings = state.bindings.filter(binding => binding.vmId !== vmId);
      }
    });
  }
  detach(subject: VmGrant, taskIds: string[] = []) {
    this.change(state => {
      state.bindings = state.bindings.filter(binding => !same(binding, subject) && !(binding.kind === "task" && taskIds.includes(binding.id)));
      for (const vm of state.instances) if (vm.access.grants.some(grant => same(grant, subject))) {
        vm.access.grants = vm.access.grants.filter(grant => !same(grant, subject)); this.event(vm, `${subject.kind} removed; VM retained`);
      }
    });
  }
  touch(vmId: string) {
    const vm = this.get(vmId);
    if (!vm || Date.now() - (vm.lastUsedAt ?? 0) < 60_000) return;
    this.change(state => { state.instances.find(vm => vm.id === vmId)!.lastUsedAt = Date.now(); });
  }
}

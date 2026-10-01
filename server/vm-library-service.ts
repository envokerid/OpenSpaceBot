import { containerComputerStatus, localVmMountable, localVmStartable, recreateDockerVmPreservingDisk, containerComputerAction, containerRuntimeStatus, containerComputerExists, instanceLocalVmTarget, perBotLocalVmTarget, SHARED_LOCAL_VM_TARGET, type LocalVmTarget } from "./container-computer.ts";
import { VmLibrary, type VmContext, type VmRecord } from "./vm-library.ts";
import type { VmAccess, VmLibraryPayload, VmSubject } from "../shared/vm-library.ts";

type Bot = { id: string; name: string; computer?: string; tasks?: { threadId: string }[]; threadId: string };
type Group = { id: string; name: string; memberIds: string[]; threadId: string; tasks?: { threadId: string }[] };
const fail = (message: string, status = 409) => Object.assign(new Error(message), { status });
export function vmTarget(vm: VmRecord) { return vm.target.kind === "shared" ? SHARED_LOCAL_VM_TARGET : vm.target.kind === "bot" ? perBotLocalVmTarget(vm.target.botId) : instanceLocalVmTarget(vm.target.id); }

export class VmLibraryService {
  registry: VmLibrary;
  private deps: { bots: () => Bot[]; groups: () => Group[]; busy: (target: LocalVmTarget) => string | null; subjectBusy: (subject: VmSubject) => boolean; lock: (target: LocalVmTarget) => () => void; reconnect: (vm: VmRecord, validate?: boolean) => Promise<void> };
  private migrating?: Promise<void>;
  private provisioning = false;
  private observing?: Promise<VmLibraryPayload>;
  constructor(registry: VmLibrary, deps: VmLibraryService["deps"]) { this.registry = registry; this.deps = deps; }
  async migrate() {
    if (this.registry.snapshot().migrated) return;
    if (this.migrating) return this.migrating;
    this.migrating = (async () => {
      const runtime = await containerRuntimeStatus();
      if (!runtime.runtime || !runtime.daemonUp) return; // Retry after daemon reconnect; don't declare absence.
      const shared = await containerComputerStatus(undefined, undefined, SHARED_LOCAL_VM_TARGET, { probeDesktop: false });
      let running = shared.managed && shared.container === "running" ? 1 : 0;
      if (shared.container !== "missing" && shared.managed) this.registry.adoptLegacy();
      for (const bot of this.deps.bots()) {
        const target = perBotLocalVmTarget(bot.id);
        if (!await containerComputerExists(runtime.runtime, target)) continue;
        const status = await containerComputerStatus(undefined, undefined, target, { probeDesktop: false });
        if (status.managed) { this.registry.adoptLegacy(bot); if (status.container === "running") running++; }
      }
      this.registry.finishMigration(running);
    })().finally(() => { this.migrating = undefined; });
    return this.migrating;
  }
  context(botId: string, threadId?: string): VmContext {
    const group = threadId ? this.deps.groups().find(group => group.threadId === threadId || group.tasks?.some(task => task.threadId === threadId)) : undefined;
    return { botId, threadId, ...(group ? { groupId: group.id, memberIds: group.memberIds } : {}) };
  }
  resolve(botId: string, threadId?: string) { return this.registry.resolve(this.context(botId, threadId)); }
  /** Group choices must work for every member, never expose a speaker's private VM. */
  choices(botId: string, threadId: string) {
    const bot = this.deps.bots().find(bot => bot.id === botId);
    if (!bot || bot.computer === "off") return [];
    const context = this.context(botId, threadId);
    if (!context.groupId && bot.threadId !== threadId && !bot.tasks?.some(task => task.threadId === threadId)) return [];
    return this.registry.list().filter(vm => this.registry.allowed(vm, context) &&
      (!context.groupId || vm.access.allBots || vm.access.grants.some(grant => grant.kind === "group" && grant.id === context.groupId)));
  }
  select(botId: string, threadId: string, vmId: string) {
    if (!this.choices(botId, threadId).some(vm => vm.id === vmId)) throw fail("This conversation does not have access to that VM", 403);
    this.bind({ kind: "task", id: threadId }, vmId, this.registry.snapshot().revision);
  }
  validateSubject(subject: VmSubject, vm?: VmRecord) {
    const bots = this.deps.bots(); const groups = this.deps.groups();
    if (subject.kind === "default") {
      if (subject.id !== "workspace") throw fail("Invalid default binding", 400);
      if (vm && vm.access.mode !== "shared") throw fail("The workspace default must be a shared VM");
      return;
    }
    if (subject.kind === "bot") {
      if (!bots.some(bot => bot.id === subject.id)) throw fail("No such bot", 404);
      if (vm && !this.registry.allowed(vm, { botId: subject.id })) throw fail("This bot does not have access to that VM", 403);
    } else if (subject.kind === "group") {
      const group = groups.find(group => group.id === subject.id);
      if (!group) throw fail("No such group", 404);
      if (vm && !vm.access.allBots && !vm.access.grants.some(grant => grant.kind === "group" && grant.id === group.id)) throw fail("Grant this group access before assigning its VM", 403);
    } else {
      const bot = bots.find(bot => bot.threadId === subject.id || bot.tasks?.some(task => task.threadId === subject.id));
      const group = groups.find(group => group.threadId === subject.id || group.tasks?.some(task => task.threadId === subject.id));
      if (!bot && !group) throw fail("No such conversation", 404);
      if (vm && (bot ? !this.registry.allowed(vm, { botId: bot.id, threadId: subject.id }) : !vm.access.allBots && !vm.access.grants.some(grant => grant.kind === "group" && grant.id === group!.id))) throw fail("This conversation does not have access to that VM", 403);
    }
  }
  validateAccess(access: VmAccess) {
    if (access.mode === "isolated" && access.grants.length !== 1) throw fail("Choose the bot or group for this isolated VM", 400);
    for (const grant of access.grants) this.validateSubject(grant);
  }
  private idle(vm: VmRecord) {
    const busy = this.deps.busy(vmTarget(vm));
    if (busy) throw fail(`This VM is in use: ${busy}. Finish or release control first.`);
    if (vm.operation?.state === "running") throw fail("A VM operation is still running");
  }
  async inventory(): Promise<VmLibraryPayload> {
    if (this.observing) return this.observing;
    this.observing = this.readInventory().finally(() => { this.observing = undefined; });
    return this.observing;
  }
  private async readInventory(): Promise<VmLibraryPayload> {
    await this.migrate();
    const runtime = await containerRuntimeStatus();
    const available = Boolean(runtime.runtime && runtime.daemonUp);
    const snapshot = this.registry.snapshot();
    const instances = await Promise.all(snapshot.instances.filter(vm => !vm.deleted).map(async vm => {
      const target = vmTarget(vm); const holder = this.deps.busy(target);
      const status = available ? await containerComputerStatus(undefined, undefined, target, { probeDesktop: false }).catch(() => null) : null;
      return { id: vm.id, name: vm.name, access: vm.access, createdAt: vm.createdAt, lastUsedAt: vm.lastUsedAt, revision: vm.revision, canRetryCreate: vm.target.kind === "instance" && !vm.creationComplete && vm.operation?.state === "failed",
        canRecreate: status?.runtime === "docker" && (localVmMountable(status) || localVmStartable(status)),
        state: status?.container ?? "unknown" as const, ready: status?.ready ?? false, problem: status && localVmMountable(status) ? null : status?.problem ?? (available ? null : "Container runtime unavailable"),
        inUse: Boolean(holder), holder, operation: vm.operation, activity: vm.activity, assignments: snapshot.bindings.filter(binding => binding.vmId === vm.id) };
    }));
    return { instances, bindings: snapshot.bindings, revision: snapshot.revision, limits: snapshot.limits, available,
      problem: available ? null : "Start Docker or Podman to manage VM power. Saved VMs are retained.",
      subjects: [...this.deps.bots().map(bot => ({ kind: "bot" as const, id: bot.id, name: bot.name })), ...this.deps.groups().map(group => ({ kind: "group" as const, id: group.id, name: group.name }))] };
  }
  edit(vmId: string, patch: { name?: string; access?: VmAccess }, revision: number) {
    const vm = this.registry.get(vmId); if (!vm) throw fail("No such VM", 404); this.idle(vm);
    if (patch.access) {
      this.validateAccess(patch.access);
      const next = { ...vm, access: patch.access };
      for (const binding of this.registry.snapshot().bindings.filter(binding => binding.vmId === vmId)) this.validateSubject(binding, next);
    }
    this.registry.edit(vmId, patch, revision);
  }
  bind(subject: VmSubject, vmId: string | null, revision: number, grantGroupAccess = false) {
    const vm = vmId ? this.registry.get(vmId) : undefined;
    if (vmId && !vm) throw fail("No such VM", 404);
    if (grantGroupAccess && (subject.kind !== "group" || !vm || vm.access.mode !== "shared")) throw fail("Only shared VMs can grant access to a group during assignment", 400);
    const proposed = grantGroupAccess && vm ? { ...vm, access: { ...vm.access, grants: [...vm.access.grants, { kind: "group" as const, id: subject.id }] } } : vm;
    this.validateSubject(subject, proposed);
    if (this.deps.subjectBusy(subject)) throw fail("Finish this bot/group's active work before changing its VM");
    const old = this.registry.binding(subject);
    for (const id of [old?.vmId, vmId]) { const record = id ? this.registry.get(id) : undefined; if (record) this.idle(record); }
    this.registry.bind(subject, vmId, revision, grantGroupAccess);
  }
  async create(name: string, access: VmAccess, requestId: string, start: boolean) {
    await this.migrate();
    if (!this.registry.snapshot().migrated) throw fail("Reconnect the container runtime before creating VMs; existing desktops must be reconciled first");
    this.validateAccess(access);
    const prior = this.registry.snapshot().instances.find(vm => vm.creationRequestId === requestId);
    if (prior) return prior.operation;
    if (this.provisioning) throw fail("Another VM is starting. Retry when it finishes.");
    const vm = this.registry.create(name, access, requestId, start);
    this.launch(vm, "create", start); return vm.operation;
  }
  action(vmId: string, action: "create" | "start" | "stop" | "reconnect" | "recreate" | "delete", requestId: string, revision: number, confirmName?: string) {
    const vm = this.registry.get(vmId); if (!vm) throw fail("No such VM", 404);
    const prior = vm.receipts.find(receipt => receipt.requestId === requestId) ?? (vm.operation?.requestId === requestId ? vm.operation : undefined);
    if (prior) return prior;
    if (action === "create" && (vm.target.kind !== "instance" || vm.creationComplete)) throw fail("Only an unfinished creation can be retried");
    this.idle(vm);
    if (action === "delete" && confirmName !== vm.name) throw fail("Type the VM's name to confirm deletion", 400);
    if ((action === "start" || action === "create" || action === "recreate") && this.provisioning) throw fail("Another VM is starting. Retry when it finishes.");
    const operation = this.registry.begin(vmId, action, requestId, revision);
    this.launch({ ...vm, operation }, action, action === "create" ? vm.startRequested !== false : true); return operation;
  }
  private launch(vm: VmRecord, action: "create" | "start" | "stop" | "reconnect" | "recreate" | "delete", start: boolean) {
    const target = vmTarget(vm);
    const reserves = action === "create" || action === "start" || action === "recreate";
    if (reserves) this.provisioning = true;
    let release: (() => void) | undefined;
    try { release = this.deps.lock(target); } catch (error) { if (reserves) this.provisioning = false; this.registry.finish(vm.id, String(error)); throw error; }
    void (async () => {
      try {
        if (reserves) {
          let running = 0;
          for (const existing of this.registry.list()) {
            const status = await containerComputerStatus(undefined, undefined, vmTarget(existing), { probeDesktop: false });
            if (!status.daemonUp) throw fail("Container runtime unavailable");
            if (status.container === "running" && existing.id !== vm.id) running++;
          }
          if (running >= this.registry.snapshot().limits.running) throw fail("Running VM limit reached. Stop an unused VM or raise the limit.");
        }
        const status = await containerComputerStatus(undefined, undefined, target, { probeDesktop: false });
        if (!status.runtime || !status.daemonUp) throw fail("Container runtime unavailable");
        if (action === "create") {
          if (status.container === "missing") await containerComputerAction("run", undefined, undefined, target);
          if (!start && (await containerComputerStatus(undefined, undefined, target, { probeDesktop: false })).container === "running") await containerComputerAction("stop", undefined, undefined, target);
        } else if (action === "start") {
          if (status.container === "missing") throw fail("This VM's container is missing. It will not be silently replaced.");
          if (status.container !== "running") await containerComputerAction("start", undefined, undefined, target);
        } else if (action === "stop") {
          if (status.container === "running") await containerComputerAction("stop", undefined, undefined, target);
        } else if (action === "recreate") {
          if (status.runtime !== "docker" || !(localVmMountable(status) || localVmStartable(status))) throw fail("Recreation requires an existing compatible Docker VM. Its disk will never be replaced with a blank one.");
          const wasRunning = status.container === "running";
          if (wasRunning) await containerComputerAction("stop", undefined, undefined, target);
          try {
            await recreateDockerVmPreservingDisk(target);
            await this.deps.reconnect(vm, false);
            if (!wasRunning) await containerComputerAction("stop", undefined, undefined, target);
          } catch (error) {
            // The disk-preserving operation rolls back on failure. Resume the
            // original desktop only if it was running before maintenance.
            if (wasRunning) {
              const restored = await containerComputerStatus(undefined, undefined, target, { probeDesktop: false });
              if (localVmStartable(restored)) await containerComputerAction("start", undefined, undefined, target).catch(() => {});
            }
            throw error;
          }
        } else if (action === "delete") await containerComputerAction("remove", undefined, undefined, target);
        else await this.deps.reconnect(vm);
        this.registry.finish(vm.id);
      } catch (error) { this.registry.finish(vm.id, error instanceof Error ? error.message : String(error)); }
      finally { release?.(); if (reserves) this.provisioning = false; }
    })();
  }
}

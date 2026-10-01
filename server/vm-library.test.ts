import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { VmLibraryService } from "./vm-library-service.ts";
import { VmLibrary } from "./vm-library.ts";

const homes: string[] = [];
function fixture(mode: "shared" | "per-bot" = "shared") { const home = mkdtempSync(join(tmpdir(), "omb-vm-registry-")); homes.push(home); const path = join(home, "vms.json"); return { path, registry: new VmLibrary(path, mode, 10) }; }
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
const shared = { mode: "shared" as const, grants: [{ kind: "bot" as const, id: "a" }, { kind: "bot" as const, id: "b" }, { kind: "group" as const, id: "research" }, { kind: "group" as const, id: "marketing" }] };

describe("persistent VM registry", () => {
 it("migrates identities idempotently and retains VMs after owner deletion and restart", () => {
  const { registry, path } = fixture("per-bot");
  const a = registry.adoptLegacy({ id: "a", name: "A" })!;
  registry.adoptLegacy({ id: "a", name: "Renamed" }); registry.finishMigration();
  expect(registry.list()).toHaveLength(1);
  expect(registry.resolve({ botId: "a" })?.vm.target).toEqual({ kind: "bot", botId: "a" });
  registry.detach({ kind: "bot", id: "a" });
  const loaded = new VmLibrary(path, "shared", 2);
  expect(loaded.get(a.id)?.target).toEqual(a.target);
  expect(loaded.get(a.id)?.access.grants).toEqual([]);
  expect(loaded.resolve({ botId: "a" })).toBeNull();
 });
 it("selects task, group, bot and default in order without leaking group access to direct chat", () => {
  const { registry } = fixture(); registry.adoptLegacy();
  const privateVm = registry.create("A desktop", { mode: "isolated", grants: [{ kind: "bot", id: "a" }] }, "create-a");
  const groupVm = registry.create("Research", { mode: "isolated", grants: [{ kind: "group", id: "research" }] }, "create-research");
  const taskVm = registry.create("Shared", shared, "create-task");
  const bind = (kind: "bot" | "group" | "task", id: string, vmId: string) => registry.bind({ kind, id }, vmId, registry.snapshot().revision);
  bind("bot", "a", privateVm.id); bind("group", "research", groupVm.id); bind("task", "special", taskVm.id);
  expect(registry.resolve({ botId: "a" })?.vm.id).toBe(privateVm.id);
  expect(registry.resolve({ botId: "a", groupId: "research", memberIds: ["a"], threadId: "normal" })?.vm.id).toBe(groupVm.id);
  expect(registry.resolve({ botId: "a", groupId: "research", memberIds: ["a"], threadId: "special" })?.vm.id).toBe(taskVm.id);
  expect(registry.allowed(groupVm, { botId: "a" })).toBe(false);
  expect(registry.allowed(groupVm, { botId: "a", groupId: "marketing", memberIds: ["a"] })).toBe(false);
  expect(() => registry.resolve({ botId: "a", groupId: "research", memberIds: [] })).toThrow(/access/);
  expect(registry.resolve({ botId: "new" })?.vm.id).toBe("legacy-shared");
 });
 it("shares one instance across selected bots/groups and rejects unrelated users", () => {
  const { registry } = fixture(); const vm = registry.create("Shared", shared, "new-vm");
  for (const botId of ["a", "b"]) expect(registry.allowed(vm, { botId })).toBe(true);
  for (const groupId of ["research", "marketing"]) expect(registry.allowed(vm, { botId: "member", groupId, memberIds: ["member"] })).toBe(true);
  expect(registry.allowed(vm, { botId: "member" })).toBe(false);
 });
 it("offers multiple choices, scopes group choices, and pins only the conversation after settlement", () => {
  const { registry, path } = fixture();
  const service = new VmLibraryService(registry, {
   bots: () => [{ id: "a", name: "A", threadId: "direct" }],
   groups: () => [{ id: "research", name: "Research", memberIds: ["a"], threadId: "room" }],
   busy: () => null, subjectBusy: () => false, lock: () => () => {}, reconnect: async () => {},
  });
  const first = registry.create("First", shared, "first"); registry.finish(first.id);
  const second = registry.create("Second", shared, "second"); registry.finish(second.id);
  const personal = registry.create("Personal", { mode: "isolated", grants: [{ kind: "bot", id: "a" }] }, "personal"); registry.finish(personal.id);
  service.bind({ kind: "bot", id: "a" }, first.id, registry.snapshot().revision);
  service.bind({ kind: "group", id: "research" }, first.id, registry.snapshot().revision);
  expect(service.choices("a", "direct").map(vm => vm.id)).toEqual([first.id, second.id, personal.id]);
  expect(service.choices("a", "room").map(vm => vm.id)).toEqual([first.id, second.id]);
  expect(service.choices("outsider", "room")).toEqual([]);
  expect(() => service.select("a", "room", personal.id)).toThrow(/access/);
  service.select("a", "room", second.id);
  expect(service.resolve("a", "room")?.vm.id).toBe(second.id);
  expect(service.resolve("a", "direct")?.vm.id).toBe(first.id);
  expect(new VmLibrary(path, "shared", 10).binding({ kind: "task", id: "room" })?.vmId).toBe(second.id);
  expect(registry.binding({ kind: "group", id: "research" })?.vmId).toBe(first.id);
  registry.edit(first.id, { access: { mode: "shared", grants: [] } }, registry.snapshot().revision);
  expect(() => service.select("a", "room", first.id)).toThrow(/access/);
 });
 it("rejects stale changes without changing disk state", () => {
  const { registry, path } = fixture(); const vm = registry.adoptLegacy()!; const revision = registry.snapshot().revision;
  registry.edit(vm.id, { name: "Changed" }, revision);
  expect(() => registry.edit(vm.id, { name: "Stale" }, revision)).toThrow(/changed/);
  expect(new VmLibrary(path, "shared", 2).get(vm.id)?.name).toBe("Changed");
 });
 it("creation retries keep one identity even after other actions; restart recovers pending jobs", () => {
  const { registry, path } = fixture(); const vm = registry.create("Persistent", shared, "create-one", false);
  registry.finish(vm.id); registry.begin(vm.id, "start", "start-one", registry.snapshot().revision);
  const loaded = new VmLibrary(path, "shared", 2);
  expect(loaded.get(vm.id)?.operation?.state).toBe("failed");
  expect(loaded.create("Persistent", shared, "create-one").id).toBe(vm.id);
  expect(loaded.list()).toHaveLength(1);
 });
 it("deletion needs a completed operation and discovery cannot resurrect a tombstone", () => {
  const { registry } = fixture(); const vm = registry.adoptLegacy()!;
  registry.begin(vm.id, "delete", "remove-one", registry.snapshot().revision);
  expect(registry.get(vm.id)).toBeTruthy(); registry.finish(vm.id);
  expect(registry.adoptLegacy()).toBeUndefined(); expect(registry.list()).toHaveLength(0);
  expect(registry.snapshot().bindings).toEqual([]);
 });
 it("retains capacity consumed by failed provisioning until explicit deletion", () => {
  const { registry } = fixture(); registry.setLimits({ saved: 1, running: 1 }, registry.snapshot().revision);
  const vm = registry.create("One", shared, "one"); registry.finish(vm.id, "Image unavailable");
  expect(() => registry.create("Two", shared, "two")).toThrow(/limit/);
  expect(registry.get(vm.id)?.operation?.error).toBe("Image unavailable");
 });
 it("shares and assigns atomically while retaining personal grants", () => {
  const { registry, path } = fixture();
  const vm = registry.create("Wren desktop", { mode: "shared", grants: [{ kind: "bot", id: "wren" }] }, "shared-wren");
  const subject = { kind: "group" as const, id: "research" };
  const stale = registry.snapshot().revision;
  registry.edit(vm.id, { name: "Personal desktop" }, stale);
  expect(() => registry.bind(subject, vm.id, stale, true)).toThrow(/changed/);
  expect(registry.get(vm.id)?.access.grants).toEqual([{ kind: "bot", id: "wren" }]);
  expect(registry.binding(subject)).toBeUndefined();
  registry.bind(subject, vm.id, registry.snapshot().revision, true);
  registry.bind(subject, vm.id, registry.snapshot().revision, true);
  const loaded = new VmLibrary(path, "shared", 2);
  expect(loaded.get(vm.id)?.access.grants).toEqual([{ kind: "bot", id: "wren" }, { kind: "group", id: "research" }]);
  expect(loaded.resolve({ botId: "other", groupId: "research", memberIds: ["other"] })?.vm.id).toBe(vm.id);
  expect(loaded.allowed(loaded.get(vm.id)!, { botId: "other" })).toBe(false);
 });
 it("cannot convert an isolated desktop or a non-group binding into shared access", () => {
  const { registry } = fixture();
  const vm = registry.create("Private", { mode: "isolated", grants: [{ kind: "bot", id: "wren" }] }, "private-wren");
  expect(() => registry.bind({ kind: "group", id: "research" }, vm.id, registry.snapshot().revision, true)).toThrow(/Only shared/);
  const sharedVm = registry.adoptLegacy()!;
  expect(() => registry.bind({ kind: "bot", id: "other" }, sharedVm.id, registry.snapshot().revision, true)).toThrow(/Only shared/);
  expect(registry.get(vm.id)?.access.mode).toBe("isolated");
 });

});

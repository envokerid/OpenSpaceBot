import { describe, expect, it } from "vitest";
import { teamMapVm } from "./team-map-vms";
import { vmAcceptsSubject, vmAssignment, vmCanAssignToGroup } from "../../shared/vm-assignment";
import type { VmInstance, VmLibraryPayload } from "../../shared/vm-library";

export function inventory(): VmLibraryPayload {
  const vm = (id: string, access: VmInstance["access"]): VmInstance => ({ id, name: id, access, createdAt: 1, revision: 1, state: "running", ready: false, problem: null, inUse: false, holder: null, activity: [], assignments: [] });
  return {
    instances: [vm("Default desktop", { mode: "shared", grants: [], allBots: true }), vm("Private desktop", { mode: "isolated", grants: [{ kind: "bot", id: "alice" }] }), vm("Research desktop", { mode: "isolated", grants: [{ kind: "group", id: "research" }] })],
    bindings: [{ kind: "default", id: "workspace", vmId: "Default desktop" }, { kind: "bot", id: "alice", vmId: "Private desktop" }, { kind: "group", id: "research", vmId: "Research desktop" }],
    subjects: [{ kind: "bot", id: "alice", name: "Alice" }, { kind: "bot", id: "bob", name: "Bob" }, { kind: "group", id: "research", name: "Research" }],
    limits: { saved: 4, running: 4 }, revision: 1, available: true, problem: null,
  };
}

describe("VM labels and assignment eligibility", () => {
  it("distinguishes personal assignments from inherited workspace defaults", () => {
    const data = inventory();
    expect(teamMapVm(data, { id: "alice", computer: "vm" })).toMatchObject({ label: "Private desktop", inherited: false, allowed: true });
    expect(teamMapVm(data, { id: "bob" })).toMatchObject({ label: "Default desktop · Default", inherited: true });
    data.bindings = data.bindings.filter(item => item.kind !== "default");
    expect(teamMapVm(data, { id: "bob" }).label).toBe("Assign Local VM");
  });
  it("shows group isolation only inside its member context", () => {
    const data = inventory(); const group = { id: "research", memberIds: ["alice", "bob"] };
    for (const id of group.memberIds) expect(teamMapVm(data, { id }, group)).toMatchObject({ label: "Research desktop", allowed: true });
    expect(teamMapVm(data, { id: "alice" }).vm?.id).toBe("Private desktop");
    expect(teamMapVm(data, { id: "outside" }, group).allowed).toBe(false);
    expect(vmAcceptsSubject(data.instances[2], { kind: "bot", id: "alice" })).toBe(false);
    expect(vmAcceptsSubject(data.instances[2], { kind: "group", id: "research" })).toBe(true);
    expect(vmAcceptsSubject(data.instances[2], { kind: "default", id: "workspace" })).toBe(false);
  });
  it("shows each member's personal assignment for an unassigned group", () => {
    const data = inventory(); const group = { id: "other", memberIds: ["alice", "bob"] };
    expect(vmAssignment(data, { kind: "group", id: group.id }).vm).toBeUndefined();
    expect(teamMapVm(data, { id: "alice" }, group).label).toBe("Private desktop");
    expect(teamMapVm(data, { id: "bob" }, group).label).toBe("Default desktop · Default");
  });
  it("does not imply that an Off or explicitly different computer uses a saved VM", () => {
    const data = inventory(); const group = { id: "research", memberIds: ["alice"] };
    expect(teamMapVm(data, { id: "alice", computer: "off" }, group).label).toBe("Research desktop · Inactive");
    expect(teamMapVm(data, { id: "alice", computer: "browser" }).inactive).toBe(true);
    expect(teamMapVm(data, { id: "alice", computer: "browser" }, group).inactive).toBe(false);
  });
  it("keeps missing and unauthorized assignments visible instead of showing a fallback VM", () => {
    const data = inventory(); data.instances = data.instances.filter(vm => vm.id !== "Research desktop");
    expect(teamMapVm(data, { id: "alice" }, { id: "research", memberIds: ["alice"] }).label).toBe("Assigned VM unavailable");
    data.bindings.push({ kind: "bot", id: "bob", vmId: "Private desktop" });
    expect(teamMapVm(data, { id: "bob" }).label).toBe("Private desktop · No access");
  });
  it("shows multiple permitted choices without changing the default or leaking private VMs into a group", () => {
    const data = inventory();
    expect(teamMapVm(data, { id: "alice" }).choices.map(vm => vm.id)).toEqual(["Default desktop", "Private desktop"]);
    expect(teamMapVm(data, { id: "alice" }).vm?.id).toBe("Private desktop");
    expect(teamMapVm(data, { id: "alice" }, { id: "research", memberIds: ["alice"] }).choices.map(vm => vm.id)).toEqual(["Default desktop", "Research desktop"]);
  });
  it("offers shared desktops with bot-only access for explicit group sharing", () => {
    const data = inventory();
    const personal = { ...data.instances[1], access: { mode: "shared" as const, grants: [{ kind: "bot" as const, id: "wren" }] } };
    expect(vmAcceptsSubject(personal, { kind: "group", id: "research" })).toBe(false);
    expect(vmCanAssignToGroup(personal, "research")).toBe(true);
    expect(vmCanAssignToGroup(data.instances[1], "research")).toBe(false);
    expect(vmCanAssignToGroup(data.instances[2], "research")).toBe(true);
    expect(vmCanAssignToGroup(data.instances[2], "other")).toBe(false);
  });

});

import type { VmInstance, VmLibraryPayload, VmSubject } from "./vm-library";

/** Assignment eligibility mirrors the registry; group access is contextual. */
export function vmAcceptsSubject(vm: VmInstance, subject: VmSubject): boolean {
  if (subject.kind === "default") return vm.access.mode === "shared";
  return vm.access.allBots === true || vm.access.grants.some(grant => grant.kind === subject.kind && grant.id === subject.id);
}

export function vmAssignment(data: VmLibraryPayload | undefined, subject: VmSubject) {
  const explicit = data?.bindings.find(binding => binding.kind === subject.kind && binding.id === subject.id && binding.vmId !== null);
  const binding = explicit ?? (subject.kind === "bot" ? data?.bindings.find(binding => binding.kind === "default") : undefined);
  const vm = data?.instances.find(vm => vm.id === binding?.vmId);
  return { vm, binding, inherited: binding?.kind === "default", allowed: vm ? vmAcceptsSubject(vm, subject) : false };
}

/** Admin picker choices include shared VMs which can gain an explicit group grant. */
export function vmCanAssignToGroup(vm: VmInstance, groupId: string): boolean {
  return vm.access.mode === "shared" || vmAcceptsSubject(vm, { kind: "group", id: groupId });
}

/** Several available desktops can coexist with one starting default. */
export function vmChoices(data: VmLibraryPayload | undefined, subject: VmSubject): VmInstance[] {
  return data?.instances.filter(vm => vmAcceptsSubject(vm, subject)) ?? [];
}

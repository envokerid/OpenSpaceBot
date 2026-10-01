import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { vmViewerPath } from "./VmPreviewCard";
import { ChatVmList, VmAssignments, VmLibraryContent } from "./VmLibrary";
import type { VmInstance, VmLibraryPayload } from "../../shared/vm-library";

it("renders access to several VMs independently from the one default", () => {
  const subject = { kind: "bot" as const, id: "wren", name: "Wren" };
  const vm = (id: string): VmInstance => ({ id, name: id, access: { mode: "shared", grants: [subject] }, createdAt: 1, revision: 1, state: "running", ready: true, problem: null, inUse: false, holder: null, activity: [], assignments: [] });
  const first = vm("First"), second = vm("Second");
  const data: VmLibraryPayload = { instances: [first, second], bindings: [{ kind: "bot", id: "wren", vmId: "First" }], subjects: [subject], revision: 1, limits: { saved: 5, running: 5 }, available: true, problem: null };
  const render = (vm: VmInstance) => renderToStaticMarkup(createElement(VmAssignments, { data, vm, busy: false, save: () => {}, grant: () => {} }));
  expect(render(first)).toContain('checked=""');
  expect(render(first)).toContain("Clear default");
  expect(render(second)).toContain('checked=""');
  expect(render(second)).toContain("Make default");
  expect(render(second)).toContain("Available · Default: First");
  second.access.grants = [];
  expect(render(second)).toContain("No access");
  expect(render(second)).not.toContain("Make default");
});

function chatInventory(): VmLibraryPayload {
  const vm = (id: string, access: VmInstance["access"], state: VmInstance["state"] = "running"): VmInstance => ({ id, name: id, access, state, createdAt: 1, revision: 1, ready: state === "running", problem: null, inUse: false, holder: null, activity: [], assignments: [] });
  return {
    instances: [
      vm("Shared desktop", { mode: "shared", grants: [], allBots: true }),
      vm("Personal", { mode: "shared", grants: [{ kind: "bot", id: "wren" }] }, "stopped"),
      vm("Group research", { mode: "isolated", grants: [{ kind: "group", id: "research" }] }),
      vm("Other private", { mode: "isolated", grants: [{ kind: "bot", id: "other" }] }),
    ],
    bindings: [{ kind: "default", id: "workspace", vmId: "Shared desktop" }, { kind: "task", id: "wren-thread", vmId: "Personal" }, { kind: "group", id: "research", vmId: "Group research" }],
    subjects: [], revision: 1, limits: { saved: 5, running: 5 }, available: true, problem: null,
  };
}

it("shows both Wren VMs as preview cards, including a stopped VM and the conversation override", () => {
  const markup = renderToStaticMarkup(createElement(ChatVmList, { data: chatInventory(), subject: { kind: "bot", id: "wren" }, threadId: "wren-thread" }));
  expect(markup).toContain("Shared desktop");
  expect(markup).toContain("Personal");
  expect(markup).toContain("stopped");
  expect(markup).toMatch(/Personal<\/h4><span[^>]*>Selected for chat/);
  expect(markup).toMatch(/Shared desktop<\/h4><span[^>]*>Default/);
  expect(markup.match(/<article /g)).toHaveLength(2);
  expect(markup.match(/Take control of /g)).toHaveLength(2);
  expect(markup).toContain("Connecting live preview");
  expect(markup).not.toContain("<select");
  expect(markup).not.toContain("<details");
  expect(markup).not.toContain("Other private");
  expect(markup).not.toContain("Group research");
});

it("shows group grants and shared defaults without exposing member-private VMs", () => {
  const markup = renderToStaticMarkup(createElement(ChatVmList, { data: chatInventory(), subject: { kind: "group", id: "research" }, threadId: "room-thread" }));
  expect(markup).toContain("Shared desktop");
  expect(markup).toContain("Group research");
  expect(markup).toContain("Selected for chat");
  expect(markup.match(/<article /g)).toHaveLength(2);
  expect(markup).not.toContain("Personal");
  expect(markup).not.toContain("Other private");
});

it("keeps missing VMs visible and clears a stale conversation highlight when switching threads", () => {
  const data = chatInventory(); data.instances[1].state = "missing";
  const markup = renderToStaticMarkup(createElement(ChatVmList, { data, subject: { kind: "bot", id: "wren" }, threadId: "another-thread" }));
  expect(markup).toContain("Personal");
  expect(markup).toContain("missing");
  expect(markup).toMatch(/Shared desktop<\/h4><span[^>]*>Selected for chat/);
  data.instances[1].access.grants = [];
  const revoked = renderToStaticMarkup(createElement(ChatVmList, { data, subject: { kind: "bot", id: "wren" }, threadId: "wren-thread" }));
  expect(revoked).not.toContain("Personal");
  expect(revoked).toContain("access has been removed");
});

it("explains an empty list without showing unrelated VMs", () => {
  const data = chatInventory(); data.instances = data.instances.slice(1); data.bindings = [];
  const markup = renderToStaticMarkup(createElement(ChatVmList, { data, subject: { kind: "bot", id: "unknown" } }));
  expect(markup).toContain("No VMs are available to this bot.");
  expect(markup).not.toContain("<li");
});

it("pins preview and control requests to the same VM and subject", () => {
  const subject = { kind: "group" as const, id: "research" };
  expect(vmViewerPath("second-vm", subject, "screen")).toBe("/api/vms/second-vm/screen?kind=group&subjectId=research");
  expect(vmViewerPath("second-vm", subject, "control")).toBe("/api/vms/second-vm/control?kind=group&subjectId=research");
});


it("offers disk-preserving recreation only for supported idle VMs and distinguishes deletion", () => {
  const data = chatInventory(); const vm = data.instances[0]; vm.canRecreate = true;
  const render = () => renderToStaticMarkup(createElement(VmLibraryContent, {
    library: { data, error: undefined, busy: false, run: async () => true, load: async () => data, clearError: () => {} },
    selection: { nonce: 1, vmId: vm.id },
  }));
  expect(render()).toContain("Recreate · keep apps &amp; files");
  expect(render()).toContain("Save any open work first");
  expect(render()).toContain("Delete…");
  vm.inUse = true;
  expect(render()).toMatch(/<button[^>]+disabled=""[^>]*>Recreate · keep apps &amp; files/);
  vm.canRecreate = false;
  expect(render()).not.toContain("Recreate · keep apps");
});

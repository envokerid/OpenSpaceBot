import type { VmLibraryPayload } from "../../shared/vm-library";
import { vmAssignment, vmChoices } from "../../shared/vm-assignment";

type MapBot = { id: string; computer?: string | null };
type MapGroup = { id: string; memberIds: string[] };

/** Shows standing assignments, not a promise about an active turn's surface. */
export function teamMapVm(data: VmLibraryPayload | undefined, bot: MapBot, group?: MapGroup) {
  const groupAssignment = group ? vmAssignment(data, { kind: "group", id: group.id }) : undefined;
  const assigned = groupAssignment?.binding?.vmId ? groupAssignment : vmAssignment(data, { kind: "bot", id: bot.id });
  const { vm, inherited, binding } = assigned;
  const allowed = (!group || group.memberIds.includes(bot.id)) && !!vm && (vm.access.allBots || vm.access.grants.some(grant => grant.kind === "bot" ? grant.id === bot.id : group?.id === grant.id && group.memberIds.includes(bot.id)));
  const inactive = bot.computer === "off" || (!groupAssignment?.binding?.vmId && bot.computer != null && bot.computer !== "vm");
  const choices = vmChoices(data, group ? { kind: "group", id: group.id } : { kind: "bot", id: bot.id });
  return { vm, inherited, allowed, inactive, choices, label: !data ? "Loading VMs…" : vm
    ? `${vm.name}${!allowed ? " · No access" : inactive ? " · Inactive" : inherited ? " · Default" : ""}`
    : binding?.vmId ? "Assigned VM unavailable" : bot.computer === "off" ? "Computer Off" : "Assign Local VM" };
}

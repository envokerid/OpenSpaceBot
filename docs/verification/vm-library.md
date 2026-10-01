# Persistent VM library

Open **App Settings → Computers → Local VMs** on desktop, or **Settings →
Computers** on the phone. Prepare the image if necessary, then choose **New VM**.
Choose shared access for selected bots/groups, or one isolated bot/group owner.
Creation does not change a default: open each VM’s settings and enable the
bots/groups under **Available to bots & groups**. Several VMs can be enabled
for the same bot or group. **Make default** chooses its starting VM without
removing access to the others. Set **Workspace default VM** on a shared VM
to make it the default. There is no separate global assignment form.
Bot assignments are used by Local VM and compatible Auto computers. A group VM
overrides its members' normal computer within that group; Computer Off remains
an explicit denial. Clearing a group assignment restores each bot's choice.

On desktop, **Team map → Computers** opens the same VM settings alongside the
map. **Add → Local VM** creates a computer there. Clicking a bot's VM label
expands settings directly beneath that VM’s row and highlights that bot’s
assignment. Each VM expands independently, with its own editing and deletion
controls.
**Groups** shows group cards, their VM, and member connections; clicking the
computer on a group card opens a menu with a selectable field of available
VMs, **Create new VM**, and **VM settings**. Selecting an existing VM saves
the group assignment. Shared VMs also appear when only individual bots currently
have access. These options are marked **Share with group** and show **Share with
group & assign** before saving the new group grant and assignment together.
Existing bot grants remain. Isolated VMs owned by other bots/groups stay excluded.
Creation opens the form with that group as the owner. Labels distinguish
explicit assignments, inherited workspace defaults, and inactive/denied VMs.
These are standing assignments; a conversation can have its own override.

Bots discover their permitted desktops with `select_computer` and select a
named VM with `vmId`. A group sees only desktops granted to that group or all
bots, never a member's private desktop. A pending switch blocks old computer
tools, waits for the provider turn to finish, then resumes on a fresh connection.
Stopped retained VMs can start; missing containers are never recreated by this
selection. The choice is saved for the conversation, leaving bot/group defaults
and access unchanged. Stop, failed turns and replaced requests cancel pending
switches. A request can switch between named VMs up to eight times.

The Team map bot cards show how many VMs are available. A group's menu lists
its available VMs, its default selector, and **Manage available VMs**, which
opens the per-VM access controls. On the phone, **Name & access** enables
multiple choices and **Default assignments** chooses the starting default.

The chat computer sidebar shows a live preview card for every permitted VM,
with a separate **Take control** button below each screen. Group chats have
these cards in their computer sidebar too. Each capture and viewer targets the
VM's stable identity, so viewing another desktop does not change any default
or conversation selection. Screens keep their previous frame until the next
one decodes; polling pauses when the app is hidden. Stopped desktops remain
visible with control disabled. The default selector stays under **Default VM
settings**.

Taking control pauses agent computer actions on that exact VM. Closing its
viewer or leaving the sidebar releases its own lease; renewable leases expire
if the client disconnects. A second viewer cannot steal or release another
viewer's control. The isolated fixture checks two distinct screen targets,
independent holds, wrong-lease rejection, and unchanged conversation bindings.
The control proxy waits longer than the server's five-second VM setup grace
period. Connection failures report unavailable control, not a human takeover;
a VM still preparing reports setup rather than another user's hold. Delayed
fixture probes (2.5 and 6 seconds) verify both paths and real hold/release gating.
Renderer checks verify one preview and one control button per permitted VM.
Visual verification is left to the user.

The registry (`vm-library.json` in the server data directory) retains named
instances independently of bot/group lifetime. Stopping a VM retains installed
apps, container files, and its mounted workspace. Existing managed desktops
are registered with their original container and workspace identities. Missing
containers are reported rather than silently recreated. Start Docker/Podman
again if the inventory reports an unavailable runtime.

Docker VM settings also provide **Recreate · keep apps & files**. It preserves
installed software, system files, settings and assignments using the complete
retained disk. It closes running applications, retains a recovery copy, refuses
occupied or missing VMs and restores the prior running/stopped state. See the
[real Docker persistence acceptance](local-vm-persistence.md).

VM settings provide Start/Stop, Reconnect control, access editing, recent activity,
and deletion with a typed name. Reconnect closes idle engine sessions for the
assigned direct and group conversations so their next turn creates a fresh
computer transport. It does not replace or reset the desktop. Release human
control and finish active turns before changing a VM or assignment.

Run the server and UI regression checks:

```sh
node node_modules/vitest/vitest.mjs run server/vm-library.test.ts server/vm-library.e2e.test.ts server/control-client.test.ts server/mcp-bridge.test.ts server/mobile-vm.e2e.test.ts server/group-local-vm.e2e.test.ts src/components/ComputerPanel.test.ts src/components/ComputerPanel.i18n.test.ts companion/test/routes.test.ts
node node_modules/vitest/vitest.mjs run server/workspace-backup.test.ts --testTimeout=60000
node node_modules/vitest/vitest.mjs run src/components/VmLibrary.test.ts src/lib/team-map-vms.test.ts src/lib/team-map.test.ts src/lib/team-canvas.test.ts
node node_modules/typescript/bin/tsc -b
node node_modules/typescript/bin/tsc -p tsconfig.server.json
```

The HTTP fixture starts the production server with a temporary HOME, data
directory, free ports, and fake engine. An import hook replaces only the
container runtime boundary with synthetic desktops. It checks migration without
replacement, exact group preview/tool targets, forbidden assignments, busy
guards, shared desktop lease ownership, stop/start retention, owner deletion,
runtime outages, missing-container refusal, named VM switching in direct and
group conversations, permission-filtered discovery, fresh tool connections,
conversation overrides, cancellation before reconnection, and unchanged standing defaults. Registry tests cover persisted
bindings, revision conflicts, interrupted jobs, capacity, and tombstones.
Companion tests check that VM management requires the settings grant. Backup
tests verify that the destination VM registry remains host-bound and survives
a workspace restore; foreign registries are rejected.

For actual package and filesystem retention, run the disposable Docker test in
[Local VM persistence](local-vm-persistence.md). The synthetic HTTP fixture does
not prove Docker filesystem persistence by itself. No test operates on the
user's live bots or VM. Renderer visual checks are left to the user.

Workspace backup is not a full VM backup: it does not export the container's
installed packages or root filesystem. Explicit VM deletion destroys those
container contents and removes bindings; the host workspace folder remains.

# Persistent VM library and bot/group assignment

Status: integrated in the local checkout on 2026-09-29. The original proposal
below records the design; the HTML preview remains a mockup.

Implemented: durable registry and migration, named VM creation, shared/isolated
access, bot/group/default assignment, contextual routing, lifecycle jobs,
capacity limits, shared control leases, desktop settings and Expo settings.
Deletion of a bot/group retains its VM. Existing desktops are adopted in place.

Current scope: local managed container desktops with the existing 2 CPU / 4 GiB
configuration. Resource resizing, snapshots/cloning, full desktop backup/export,
remote providers, and a desktop group viewer are not included. Group routing and
phone preview/control use the group's assigned VM. Explicit VM deletion removes
its container and clears assignments, but retains the host workspace folder.
Task overrides are supported by the API; bot/group/default selectors are exposed
in the UI. See [verification](../verification/vm-library.md).

## Product decision

Make a VM an independent, named workspace resource. Bots and groups reference
its stable ID. A VM survives conversations, assignment changes, and deletion of
the bot/group that originally requested it. Users can create multiple VMs,
reuse any VM they are allowed to use, and share one VM across selected bots and
groups. Shared and isolated VMs coexist; remove the global either/or switch.

Keep the existing Local VM name in the UI. These are managed containerized
desktops on the current host, not a new hypervisor or remote hosting product.

| Access | Meaning | Example |
| --- | --- | --- |
| Shared | Available to explicitly selected bots/groups | Research desktop used by Research and Marketing groups |
| Isolated for a bot | Only that bot may use it | Coding bot's development desktop |
| Isolated for a group | Only that group's execution context may use it | Research members work together inside Research's desktop |

A group's isolated VM is shared among its participating bots. It is isolated
from other groups and those bots' unrelated direct conversations. The same bot
can therefore use a personal VM in direct chat and a group VM inside a group.
Sharing includes files, installed apps, browser sessions, and credentials
already present in that desktop. Picking a VM never copies another VM's files.

## Baseline before integration

- `server/config.ts` exposes global `localVm.mode: shared | per-bot` and
  `maxInstances`. Selection happens through `localVmTargetForBot` in
  `server/index.ts`; it has no group context or independent VM ID.
- `server/container-computer.ts` already has target-specific names, workspace
  directories, viewer ports, readiness checks, and hardened-container checks.
  Reuse these boundaries with registry-backed targets.
- `server/local-vm-inventory.ts` derives inventory from existing bot IDs. It
  cannot be the authoritative list for detached VMs or deleted owners.
- `LocalComputerSection.tsx` has an inventory view; Expo's Computers settings
  still exposes the global isolation mode. Both need the same new model.
- Group routing, preview, desktop control, mobile control, Auto selection, and
  agent computer tools currently resolve targets in several places. They must
  share one resolver to avoid displaying one VM while acting on another.
- The bot-deletion path currently includes per-bot VM cleanup. It must become
  detach-only before the library model is enabled.
- Existing leases and mobile takeover provide useful foundations for
  exclusive use. Re-key ownership by VM ID, including cross-group users.

## Proposed UI

### 1. Computers → Local VMs

Promote inventory into the main place to manage VMs. Keep a shortcut in App
Settings → Computers; preserve existing cloud/remote sections. Desktop uses
rows with a detail view; mobile uses stacked rows and a full-screen detail view.

Header: **Local VMs**, **New VM**, and a compact capacity line such as
“2 running · 4 saved · running limit 3”. Illustrative values are not host readings.
List every retained VM, including stopped and unassigned instances.

Each row shows:

- Name, shared/isolated scope, and default marker if applicable.
- Power/readiness: Creating, Starting, Ready, Stopped, Needs attention, Missing.
- Current use: “Chief · Research”, “You control it”, “Available”, or waiting count.
- Assigned bots/groups, last used, and measured storage usage when available.
- Open details and Start/Stop when applicable. No destructive row shortcut.

Details contain **Overview**, **Access**, and **Activity**:

- Overview: status, current holder/waiters, assignments, resource limits,
  storage, created/last-used times, and connection health. “Running · control
  disconnected” differs from “Stopped”; offer **Reconnect control** for the former.
- Access: scope and approved bots/groups. Show direct grants separately from
  access inherited through a group. Administrators can add/remove access.
- Activity: creation, start/stop, assignment changes, control transfers,
  connection failures, and deletion records. Do not store screen contents,
  passwords, or input text in the activity log.
- Start resumes existing storage. Stop retains it. Reconnect replaces the
  control transport without replacing the desktop. While in use, explain who
  must finish/release before stopping or changing access/assignment.
- Delete lives at the bottom of details. Preview affected assignments and data,
  require typing the VM name, and block while held or a lifecycle job is active.
  Distinguish deleting the container from explicitly deleting its retained
  workspace folder. Never label Stop or Reconnect as Recreate.

### 2. New VM

One form, also reachable from a bot/group computer picker:

1. Name (suggest “Research desktop” when opened from Research).
2. Access: **Shared with selected bots/groups** or **Isolated for one bot/group**.
3. Choose allowed bots/groups or the isolated owner. An administrator can also
   create an unassigned shared VM for later use.
4. Resources: existing supported defaults, initially 2 CPUs / 4 GiB memory,
   with advanced limits only on runtimes that enforce them.
5. **Create & start**, or **Create stopped**. A retained stopped VM still uses disk.

Use the managed base image; first creation offers image preparation as a
separate progress step if needed. Show progress, cancel before provisioning
where safe, and a recoverable failed state. Repeated submit/retry must not
create duplicate VMs. Creating from a bot/group offers **Use for this bot/group**
and returns to its picker after success. New VMs start clean; cloning is separate.

### 3. Bot → Computer

Preserve the existing surface choices (Auto, Local VM, Cloud, etc.). For Local VM:

```
Local VM
Use: [Workspace default / Choose existing / Create isolated VM]
     Research desktop · Shared · Ready
     Also used by Research and Marketing
```

The existing picker lists only eligible VMs and makes their status/scope clear.
Selecting a stopped VM reuses it; offer **Start & use**. Saving an assignment
alone does not provision or silently start anything. If no VM is eligible,
offer Create VM or request access. A busy VM can be assigned but shows its owner
and expected wait behavior. Changing a current assignment applies at an idle
boundary; reject changes while affected turns/control leases are active in v1.

### 4. Group → Computer

```
Group computer
( ) Use each bot's computer
( ) Use one Local VM for this group
    [Choose existing VM] [Create isolated group VM]
```

**Use each bot's computer** preserves current behavior during migration.
With a group VM, every eligible speaker's computer actions use that VM in this
group. Its private/direct-chat default remains unchanged. Show “All group
members share this desktop's files and browser sessions.” Group membership
changes update contextual access without adding permanent direct bot grants.
If a speaker cannot use computer tools, report that explicitly rather than
redirecting it to another computer.

### 5. Conversation computer panel

Show a compact identity line: **Research desktop · From Research group**,
**Chief desktop · From bot settings**, or **Task override**. Include Manage VM
and Switch VM (when idle). All previews/takeover refer to that same identity.
If occupied: “Writer is using Research desktop in Marketing. Waiting for access.”
Human takeover retains current semantics: pause new bot computer actions until
release, then require a fresh screen before the next action.

Mobile uses the same labels, assignments, and lifecycle actions. VM control
keeps tap/double-tap/hold and swipe gestures; VM management does not add those
removed action buttons back.

## Assignment and access rules

Separate three concepts: **instance** (the saved machine), **access** (who may
use it), and **assignment** (which eligible machine a context chooses).

Resolve an explicit Local VM request in this order:

1. Conversation/task override, if eligible for its bot/group context.
2. Group VM, if the group chose one; otherwise continue with that speaker's settings.
3. Bot VM assignment.
4. Workspace default VM, if its access policy permits this context.
5. No VM configured: show setup; do not silently create or choose an unrelated VM.

Resolve the computer surface first. An explicitly disabled computer remains
disabled; a VM assignment does not silently enable it. For a group that explicitly
selects Local VM, validate each speaker's capability/permission and explain a
conflict with disabled computer access. Auto can consider the resolved eligible
VM but cannot wander through the library looking for an idle unrelated desktop.

An isolated bot VM accepts that bot's contexts when no group VM overrides it.
An isolated group VM accepts only that group's member execution contexts.
An explicit task override can select only a VM already allowed to that context;
it cannot expand access or bypass workspace restrictions.

Removing a grant also clears affected assignments transactionally or refuses
with the full impact list. Changing isolated → shared requires explicit selection
of additional users; shared → isolated requires resolving incompatible bindings.
Deleting a bot/group removes its assignments and grants, leaving its VM visible
as **Unassigned**. An orphaned isolated VM stays inaccessible to bots until an
administrator reassigns its owner or makes it shared. Humans with VM-management
permission can still inspect/manage it.

## Registry, execution, and lifecycle

Persist a versioned registry in the existing workspace data store, with atomic
writes and schema validation. Avoid a second unrelated source of truth.

| Record | Required fields |
| --- | --- |
| VM | Stable UUID, name, local host ID, backend, runtime/container identity, managed image digest/contract version, access policy, resource limits, storage identity, creation time, creator, last use, revision |
| Binding | Subject kind and ID (bot/group/task/workspace default), VM ID or explicit inheritance, revision |
| Operation | ID, VM ID, idempotency key, operation, progress/status, timestamps, bounded error |
| Observation | Last runtime observation, observed time, availability/health, resource usage if supported; stale observations marked clearly |
| Lease | VM ID, holder kind, bot/group/thread/turn or human session, expiry, fencing generation |

Observed runtime state is separate from desired state and current ownership.
Daemon unavailable means **Unknown / last seen…**, never “deleted”. Runtime
reconciliation must list owned resources independently of bots, validate exact
managed labels and isolation contract, and surface detached managed containers
for explicit recovery. Do not adopt arbitrary containers by name.

Provisioning reserves capacity before launching, persists an operation record,
and reconciles interrupted operations after restart. A unique request key and
per-VM lifecycle lock make retries safe. Failed setup retains a diagnostic row
and offers Retry or explicit cleanup; it must not leave hidden permanent VMs.

Use one resolver returning `{vmId, target, bindingSource, revision}` for direct
turns, group speakers, tasks/goals, scheduled work, MCP gates, screenshots,
screen streams, browser control, and desktop/mobile takeover. Pin it per turn
and lease; never re-resolve a live tool call to a different machine. Revalidate
membership/grants and fencing generation on tool entry, including long-lived
sessions. Revoke old streams and MCP authority when binding/access changes.
Raw viewer endpoints must not become an authorization bypass.

Exactly one bot execution context or human controls a VM at a time. Different
VMs can work concurrently. A shared VM queues requests for ownership, not clicks
or keystrokes: after acquiring it, refresh the screen and let the agent decide
the next action. Cancel waiting entries on turn cancellation, membership changes,
or disconnect. Reuse existing lease fairness and renewal behavior where possible.
Expose the current holder and wait reason consistently on desktop and phone.

Capacity distinguishes **saved VMs** from **running VMs**. Stopped containers
consume disk but no guest CPU/RAM. Enforce a running limit and supported memory/
CPU reservations atomically; report host/runtime limits separately. Carry the
legacy count cap forward as a saved-instance cap until explicitly changed,
rather than accidentally allowing unbounded retained storage. Start limits must
accommodate migrated running VMs without stopping them. Do not evict/delete a VM
automatically to make capacity. Disk statistics can be Unknown on unsupported
runtimes; avoid invented per-VM hard disk quotas.

## Persistence contract

- Stop/start, app restart, reassignment, and bot/group deletion retain installed
  apps, browser profiles, and files throughout the container filesystem.
- No TTL or automatic deletion. Default idle behavior stays “Keep running”; an
  optional later “Stop after idle” policy can conserve memory without deleting.
- Preserve the container writable layer and workspace storage. Pin its existing
  image contract; preparing a newer base image only affects newly created VMs.
  An incompatible existing desktop is shown for explicit recovery, never replaced.
- “Persistent” describes retained disk state, not preservation of running
  processes, `/tmp` semantics, or protection from host/disk loss.
- Full backup/restore is a separate feature: it must cover installed packages,
  root filesystem changes, volumes/workspace, ownership metadata, and image
  dependencies. A workspace-only archive must not be labeled “VM backup”.
  Plan consistent stopped backups and restore verification before enabling that UI.
- Keep clone, reset, image upgrades, and remote-host relocation outside the first
  release. These need explicit storage/credential-copy semantics and must not
  appear as working controls in the initial product.

## Proposed API boundary

Use one registry API rather than separate shared/per-bot creation APIs:

- `GET /api/vms`, `GET /api/vms/:id`: authorized inventory/details.
- `POST /api/vms`: validate specification, reserve capacity, return durable operation.
- `PATCH /api/vms/:id`: revision-checked name/access/settings changes.
- `POST /api/vms/:id/actions`: fixed start/stop/reconnect/delete schema,
  expected revision, idempotency key; asynchronous operation ID where needed.
- `GET /api/vm-operations/:id`: bounded progress/error and completion result.
- `PUT /api/computer-bindings/:kind/:id`: authorize subject and VM, validate
  eligibility, expected revision, and idle boundary in one transaction.
- Extend discovery/control responses with VM identity and assignment source.
  Preview and input remain authorized against the selected conversation context.

Administration grants control creation, deletion, access, and global assignment.
Existing computer-use grants authorize acting on an assigned eligible VM, not
unrestricted VM management. A bot can request use/release of an eligible VM;
autonomous provisioning can follow later behind an explicit capability and
resource budget. User-created instances are sufficient for the first release.
Scope registry state/events and audit reads to the authenticated workspace.

## Migration without recreation

1. Save the old config and a versioned migration record. Inventory verified
   shared/per-bot resources, including stopped containers and workspaces.
2. Register the shared container as “Shared desktop”, retaining its exact
   container identity, port, workspace, and image. Register existing per-bot
   containers as isolated VM records. Do not rename or relabel by recreation.
3. Preserve old shared-mode eligibility using explicit grants to existing bots
   and a compatibility default policy for future bots; expose this policy in
   settings. Preserve old per-bot bindings for bots with existing VMs. Bots
   without a VM show setup rather than provisioning during migration.
4. Keep groups on “Use each bot's computer”. Preserve task surface overrides.
   Register inactive legacy VMs even if the current global mode ignores them.
5. Turn old lifecycle routes into authorized adapters to registry IDs. Remove
   bot-deletion cleanup and mode-switch deletion paths. Stop writing legacy
   `mode` once bindings are authoritative; new clients cannot mix both models.
6. If runtime inspection is unavailable, retain known references as unverified,
   block conflicting provisioning, and resume migration after reconnection.
   Commit mapping/config changes atomically and make reruns idempotent.

Roll out with a feature flag and a read-only registry preview first. Activation
requires draining current leases before changing the routing authority. Rollback
must never delete new resources; after new assignments exist, old binaries cannot
represent them, so reject unsafe downgrade or use a compatible read-only mode.

## Implementation stages and acceptance

1. **Review this plan and UI.** Settle labels and sharing behavior before integration.
2. **Registry and migration.** Discover all retained VMs independently of owners;
   preserve exact existing container/storage identities, including restart recovery.
3. **Resolver and authority.** Wire bot/group/task assignment, access checks,
   leases, input, previews, and stream identity through the same selected VM.
4. **Management API and lifecycle.** Idempotent creation, capacity reservations,
   start/stop/reconnect, detach-only owner deletion, and explicit VM deletion.
5. **Desktop and Expo UI.** Library, detail, create, bot/group pickers, assignment
   origin, occupied/disconnected/missing states, and translations.
6. **Isolated integration verification, then opt-in rollout.** Follow
   `docs/verification/README.md`; no mutation tests against retained user VMs.

Required acceptance scenarios:

- Two bots and two groups explicitly share one VM and see the same saved apps/files.
- An isolated bot and isolated group reject every unrelated context, including
  spoofed group IDs and a removed group member's stale MCP/preview connection.
- One bot uses different direct-chat/group VMs without cross-routing screen or input.
- Two VMs operate concurrently; users sharing one VM serialize ownership fairly.
- Human takeover blocks competing computer actions, then returns usable control.
- Stop/start and host/app restart retain synthetic installed app and files in
  `/etc`, `/opt`, home, and workspace; no container replacement during migration.
- Deleting/reassigning an owner retains its VM and reveals it as unassigned.
- Concurrent creates cannot overrun limits; crashes/retries cannot duplicate VMs.
- Runtime outage does not empty inventory, erase bindings, or trigger fresh creation.
- Disconnected control recovers without changing the saved desktop.
- Desktop/Expo agree on VM ID, access, holder, assignments, and lifecycle status.

Use unit tests for resolver/access/migration/races and isolated server/container
fixtures for actual persistence and routing. Leave visual review to the user
unless they explicitly ask us to launch UI verification.

OpenMausBot thread research — 22 September 2026
================================================

The existing **Settings → Appearance → Show threads** switch hides direct-bot thread navigation. It does not disable conversations, execution, automation, or thread creation on the server. Turning it off preserves the selected conversation and existing work; turning it back on restores browsing.

This report describes the current workspace source, including its pre-existing uncommitted changes. It does not infer the configuration of a running installation. No live application settings or data were changed.

**What a thread is**

A bot is the shared identity: its profile, instructions, long-term memory, tools, integrations, and defaults. A thread is one conversation belonging to that bot. Internally it is still called a `TaskRecord`, and HTTP routes still use `/tasks`. These are the same records, not separate task and thread systems.

Each thread has its own ID, transcript and conversation branches, provider continuation state, model selection, approval preferences, unread state, usage accounting, and execution state. New threads copy the bot's defaults and start with empty provider continuation state. A provider's context is therefore distinct from a sibling's conversation. The bot can still recall its own earlier conversations through recall tools, and long-term memory is shared: threads are not private sandboxes within a bot.

Folders are labels organizing a bot's threads. They are not filesystem directories, security boundaries, or independent copies of a bot. Removing a folder keeps its conversations. Local CLI work normally gets a thread-specific working directory; explicitly selected directories and existing provider sessions can retain pinned paths.

Sources: [wire records](../shared/wire.ts), [task creation and settings](../server/store.ts), [workspace ownership](../server/workspace.ts), [recall tools](../server/drivers/agents-proxy.ts).

**How work runs**

Selecting a thread changes what the person sees. It does not redirect a running provider, its output, approval requests, or Stop command. Dispatch takes a snapshot for the targeted thread, and internal tool capabilities are bound to that thread and execution generation.

The server defaults to **three concurrent direct threads per bot**. Settings → General → Parallel threads accepts **1–10**; this is a server setting applied as a limit to each bot, not a cap on the number of saved conversations. There is no supported zero value or general `threads.enabled` switch in this configuration.

When a bot is at capacity, additional messages wait as cancellable composer entries and do not enter the transcript until dispatch. An approval wait occupies capacity. Raising the limit can release waiting work; lowering it does not interrupt work already running. Stop targets the selected execution, and freeing capacity can allow another queued conversation to start. Consequently, stopping one job is not a way to pause all queued work.

Current user follow-up queues are durable in SQLite. On restart, only pending sends whose dispatch has not begun are restored. This is more recent than the original independent-threads plan, which described an in-memory queue. Different kinds of automation and delegation have their own lifecycle rules; do not generalize user queue behavior to every handoff.

Parallel threads do not imply independent physical computers. The server coordinates shared desktops, browser resources, and overlapping working directories using execution ownership. Those protections do not sandbox arbitrary shell commands. Group/channel orchestration also has its own serialized behavior and can block direct work for a participating bot.

Sources: [capacity configuration](../server/config.ts), [settings control](../src/components/ThreadConcurrencySettings.tsx), [dispatch and queue drain](../server/index.ts), [durable follow-ups](../server/steer-queue.ts), [resource ownership](../server/turn-resources.ts).

**Exactly what Show threads off changes**

| Area | Effect |
| --- | --- |
| Bot sidebar | Hides thread trees, folder navigation and creation controls; bot rows become more prominent. |
| Bot context menu | Removes New thread and New folder actions. Other bot actions remain. |
| All threads picker | Hidden for direct bot conversations. |
| Current conversation | Stays selected with its transcript, model and settings. Clicking the bot reopens its selected conversation. |
| Quiet older conversations | Remain stored but disappear from normal history browsing. Turn Show threads on again to browse them. |
| Running, queued, waiting or unread siblings | Stay reachable through activity entries. Other activity below the chat header also provides access when the sidebar is closed. |
| Stop and approvals | Keep their thread ownership. Open the relevant activity entry to operate on that conversation. |
| Thread links in messages | Still open their referenced thread; the link handler does not consult the preference. |
| Group/channel histories | Keep their own thread controls. The setting is not a global ban on thread UI. |
| Running providers and queues | Continue unchanged. |
| Model, account and approval overrides | Remain attached to each thread. |
| Bots, routines and HTTP APIs | Continue to use and create thread records when otherwise authorized. |
| Stored messages, generated files and logs | Not deleted, merged, archived, reset or compacted by the toggle. |
| Switching the setting back on | Restores thread/folder browsing; the retained sidebar component preserves folder disclosure across a toggle. |

The activity list is deliberately not a substitute for history. Once a sibling has finished, been read, and has no qualifying activity, it disappears from that list. It is easy to visit a completed reply, switch elsewhere, and then need to re-enable Show threads to browse back to it. A retained explicit thread link can also provide access.

Routine execution threads are excluded from ordinary thread/activity lists and are reached through their run receipts/results surfaces. This exception exists independently of Show threads.

Sources: [preference implementation](../src/lib/thread-preferences.ts), [sidebar](../src/components/Sidebar.tsx), [picker](../src/components/TaskPicker.tsx), [activity filtering](../src/components/SidebarBotActivity.tsx), [thread links](../src/components/ThreadChip.tsx), [existing verification walkthrough](verification/threads.md).

**Scope and persistence of the preference**

Show threads defaults to on. The renderer saves `omb-show-threads` in local storage, using `0` for off and `1` for on. It makes no server configuration request. The setting normally survives reload; when storage is blocked, the implementation retains the choice for the current session. Storage events update other windows sharing that storage area.

The product calls this “on this device only.” More precisely, browser local storage is scoped to the origin and browser storage profile; it is not an account-wide or server-wide preference. Different clients may therefore show different thread navigation. See [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) and [storage events](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event).

Native iOS, Android and the Expo client have their own thread navigation. No consumer of this display preference was found in those clients. Their direct-thread selection can be local to the phone, independently of the desktop's selected conversation. The desktop preference key is included in the full workspace backup's client-state allowlist, so an explicit restore may transfer it; that is different from live synchronization.

Sources: [preference implementation](../src/lib/thread-preferences.ts), [backup keys](../shared/workspace-backup-client.ts), [iOS verification](verification/ios-threads.md), [Android verification](verification/android-threads.md), [Expo thread navigation](../expo/src/core/threads.ts).

**Automations and bot-created threads**

The authorized user API can still create threads while navigation is hidden. Bots can also use thread tools when those tools are available for the current turn. In the current bounded-coordination path, a direct user request can give a bot `start_thread` for separate jobs on itself, capped at five per turn. Self-opened jobs cannot recursively open further jobs. Teammate work uses `coordinate_bots` on that path; older/general delegation paths also exist. The earlier thread-aware design document is therefore not an exact description of every current turn's tool menu.

Bot-created threads do not automatically activate the person's selection. They can run or queue while Show threads is off, and their source conversation can contain a clickable creation receipt. `list_threads` and `close_thread` operate subject to ownership and visibility checks; closing folds a finished conversation out of normal display without deleting it.

Routines create a new execution thread per run. Scheduled work is detached; the current routine code explicitly activates webhook-created tasks. Results can use a separate results thread or an existing source conversation. Incident handling also has a dedicated thread creation path. Hiding navigation does not change any of these routing decisions, and it does not guarantee that automation can never change the selected conversation.

Sources: [tool availability](../server/drivers/agents-proxy.ts), [internal thread routes and routine callbacks](../server/index.ts), [routine dispatch](../server/routines.ts).

**Data, context and cost consequences**

The toggle retains all context boundaries. It does not combine older histories into the selected conversation, make the bot forget anything, or start fresh context. A person who wants a clean conversation will need to restore the creation controls or use another authorized creation path.

Thread metadata/provider state is retained with bot records; SQLite `messages.db` is the current transcript source of truth, with lazy import of legacy transcript JSON. Events and provider-native logs also use thread IDs. Optional size/retention policies exist separately. The retention sweep deletes eligible old event logs, not transcripts or thread records, and excludes busy, unread and open-handoff threads. Hiding threads does not trigger that sweep.

No backend CPU, token, spending, or storage reduction follows from changing Show threads. UI rendering may differ, but no performance improvement was benchmarked. Setting parallelism to one reduces simultaneous direct work per bot; it does not inherently reduce the total work or tokens required. Different bots can still work concurrently.

Deletion is separate and destructive to conversation records. Deleting the final visible direct conversation creates a fresh empty replacement; generated project files are retained. None of this happens when navigation is hidden.

Sources: [SQLite persistence](../server/message-db.ts), [task deletion](../server/store.ts), [event retention](../server/thread-retention.ts), [log configuration](../server/config.ts).

**If the intention is to disable threads as a product feature**

| Intended outcome | Existing capability |
| --- | --- |
| Simpler bot-first interface | Show threads off, with activity and approval access retained. |
| One direct job at a time per bot | Parallel threads set to 1. Existing active jobs finish; other conversations remain. |
| Prevent any new conversation creation | No general switch. Requires server enforcement across user APIs, bot tools, routines, webhooks, results and incident paths. |
| Exactly one visible conversation per bot | Requires a deliberate routing/history design, especially for background work and old conversations. |
| Remove thread IDs and infrastructure entirely | Major architectural change: storage, provider sessions, events, approvals, queues, Stop, usage, automation, links and companion APIs depend on them. |

My recommendation is to retain internal threads even if the product becomes simpler. Use the display toggle for decluttering and the concurrency setting for scheduling. A future “single conversation” mode should keep internal execution identities, preserve older histories through an archive/history surface, decide where background results go, and enforce any creation restrictions on the server. Reusing one provider conversation for unrelated jobs would mix their context and remove useful per-conversation control.

**Verification scope**

Source inspection covered the renderer preference and its consumers, server task model and routes, capacity/queue behavior, tool availability, routines, storage, resource ownership, backup keys, and mobile navigation sources/recipes. Existing verification documents were treated as supporting history, not proof that every scenario was rerun today.

The selected regression run completed with **6 test files passed; 61 tests passed and 1 skipped** in 84.35 seconds. The skipped case checks shared-computer ownership on macOS and is not applicable to this Linux host. The command was:

```sh
node_modules/.bin/vitest run src/lib/thread-preferences.test.ts src/components/TaskPicker.visibility.test.ts src/components/Sidebar.simple-mode.test.ts src/components/SettingsModal.appearance.test.ts server/independent-threads-api.test.ts server/thread-capacity-api.test.ts
```

These checks cover preference persistence, hidden-mode rendering/navigation, group controls remaining visible, independent execution, model and approval targeting, Stop, folder conflicts, routine dispatch, capacity limits, queue snapshots and limit changes. The locally installed Vitest executable was used because `pnpm` was not on PATH.

Server suites use `launchVerificationServer` from the documented control surface, with temporary homes/data and fake providers; no mutations target a live app. Their cleanup closes the owned fixtures. JSON evidence and server logs are retained in `/tmp/openmausbot-verification-evidence/` under the run's worker suffixes `-221525` and `-226138`. This research does not certify real-provider behavior or a fresh native-mobile/interactive-renderer walkthrough.

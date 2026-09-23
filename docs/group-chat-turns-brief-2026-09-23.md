**Group chat: how bots read and take turns**

Research date: 23 September 2026. This describes the current working tree, including local changes. It is a source-code review; no server was launched, runtime behavior tested, or live data accessed.

The server assigns speaking turns. Room membership alone does not run a bot or continuously feed it new messages. When selected, a bot receives room context, runs with its own identity and capabilities, and writes into the shared transcript. Speakers within one room run sequentially; independent conversations can run concurrently.

**1. Who gets the first turn?**

For an ordinary human message, routing follows this order:

| Message / setting | Who responds |
| --- | --- |
| Contains `@everyone` | All active room members, in membership order. |
| Contains recognized `@Name` mentions | Those members, in mention order; duplicates are removed. |
| No recognized mention; default is a member | That member. |
| No recognized mention; default is Everyone | All active members. |
| No recognized mention; default is Mentions only | Nobody; the message remains in the transcript. |

New or older rooms without a valid default normally fall back to their first member. Names match case-insensitively, support spaces, and require boundaries; the longest matching name wins. Archived bots are excluded. An unrecognized mention does not suppress the room's default routing. In bot-to-bot channels, an untagged human message instead falls back to the last speaker, or the first available member.

Sources: [routing and defaults](../server/store.ts#L403), [round creation](../server/index.ts#L9645), [composer routing](../src/lib/group-routing.ts#L42).

**2. What does a bot read?**

Each room turn receives a newly assembled context containing the last **30 eligible transcript entries**: text messages, work digests, and coordinated-result receipts expanded into reports where access permits. Ordinary activity/tool rows are omitted. Speaker names identify who said what; replies include their reply context. Later speakers therefore see earlier speakers' completed replies.

The prompt also includes the bot's role and standing instructions, room roster, room bulletin, memory, relevant skills, and recent-work context. Recent-work context can include the bot's private conversations; the room gets an activity notice when such context crosses into it. Supported engines also receive images from the latest human message.

The room runner sends this explicit context without a provider resume cursor, rather than continuing the bot's private chat session. The 30-entry window is not the bot's complete knowledge: memory, recent-work summaries, and permitted recall tools can add information. A new post is not automatically injected into an already running model turn; explicit steering is a separate path.

Sources: [context serialization](../server/index.ts#L8354), [images/context](../server/index.ts#L8553), [prompt and memory](../server/index.ts#L8851), [provider dispatch](../server/index.ts#L9046).

**3. How does a bot write, and who speaks next?**

The server claims the bot and records it as the room's current speaker. Provider events stream to clients; completed assistant text becomes a persisted room message attributed to that bot. One model turn can produce several text messages and tool activities. The next speaker waits for the entire turn to settle, not merely its first text message.

After an ordinary reply finishes, the server scans its completed text for mentions. It can give mentioned teammates **one additional hop**. A shared `spoken` set allows each bot only one turn per human-message round, including both directly selected and summoned bots. Chained replies cannot summon another layer. Coordinated turns and Goal mode disable this mention-following path.

Example: the human tags A and C; A replies with `@B`. The order is **A → B → C**. If B mentions A, A does not get another turn. If A mentions C, C speaks immediately and is skipped when the original responder list reaches it. Mentioning an outside-room bot does not recruit it; reachable outside-room mentions can produce a warning.

Sources: [speaker claim](../server/index.ts#L8710), [message attribution](../server/index.ts#L4734), [turn completion](../server/index.ts#L9019), [mention chaining](../server/index.ts#L9196), [responder loop](../server/index.ts#L9806).

**4. Waiting, new messages, and stopping**

- A selected bot busy elsewhere normally holds up the room's responder order until free. Waiting uses store-change notifications and consumes no model turn. The default wait cap is **30 minutes**, overridable by `OMB_GOAL_WAIT_MAX_MS`; ordinary chat then skips that member. A narrow race where another conversation claims the bot during setup can also cause a skip.
- New human messages normally queue while the room is working, pinned to their original conversation. Once idle, the server drains them. Explicit steering can deliver the first queued message to the current speaker if its engine supports it.
- Room queues are keyed by group ID, so separate tasks within the same room still share speaking capacity.
- Each speaker has a configurable work deadline: **5 minutes by default**, configurable from 1 to 1,440 minutes. Approval/question waits pause that deadline. A separate watchdog handles stalled turns.
- Room Stop cancels the selected room operation, its waits and coordinated handoff tree, and interrupts the active speaker. Stopping a room that is waiting for a bot does not interrupt that bot's unrelated conversation. Late provider events are fenced off from replacement turns.

Sources: [member waiting](../server/index.ts#L3027), [wait default](../server/index.ts#L3643), [message queue](../server/index.ts#L14751), [steering](../server/index.ts#L14785), [deadlines](../server/room-turn-timeout.ts), [timeout defaults](../server/config.ts#L23), [Stop](../server/index.ts#L14886).

**5. Other ways bots participate**

| Mechanism | Turn behavior |
| --- | --- |
| `coordinate_bots` | Assigns advice/work to 1–4 existing teammates per call. Recipients queue, run, return results, and automatically resume the sender after all its children settle. |
| Goal / “Finish together” | A coordinator repeatedly selects one worker, reads the result, then decides the next step. |
| `post_to_room` | Appends a bot-authored message and marks the room unread. Starts no turns, even if the post contains mentions. |

For **coordination**, omitting the destination uses the current room; specifying another room uses that room's main conversation. From direct chat, the default destination is each recipient's main conversation. Same-room work waits for the sender to finish and remains sequential; independent destinations can start immediately. The sender is instructed to end its turn rather than poll. Each recipient uses its own model, tools, permissions, and environment. Access and any required peer approvals are checked before dispatch. Requests have retry keys, cycle checks, and bounds of depth 4, 24 requests, and 48 executions per tree, plus time limits. Unfinished work is marked failed on server restart, not replayed.

For **Goal mode**, the first explicitly mentioned active member becomes coordinator; otherwise selection prefers the configured lead, then an in-room Chief, then the first active member. A private structured decision selects the next worker or declares completion, missing human input, or a blocker. The loop is capped at **13 turns**, reserving the final turn for the coordinator. Invalid decisions and repeated assignments stop it; worker wait exhaustion can return to the lead for reassignment. This loop owns its turns and does not run a competing coordination loop.

For **posting**, the bot must be eligible to post into the destination room and cannot post into the room where it is already speaking. Posts are capped at 4,000 characters and subject to approval policy, duplicate/rate checks, loop detection, and an unanswered-post ceiling. Other bots can read the post as context on a later turn, but do not wake just because it arrived.

Sources: [coordination API](../server/index.ts#L12703), [handoff scheduler](../server/room-handoffs.ts), [handoff dispatch](../server/index.ts#L2820), [Goal protocol](../server/group-goal-run.ts), [Goal loop](../server/index.ts#L9431), [posting](../server/index.ts#L12803), [posting limits](../server/room-post-budget.ts).

Existing regression coverage includes [busy-room waits](../server/room-chat-wait.e2e.test.ts), [coordination](../server/room-coordination.e2e.test.ts), and [Goal runs](../server/group-goal-run.e2e.test.ts). These were not executed for this brief.

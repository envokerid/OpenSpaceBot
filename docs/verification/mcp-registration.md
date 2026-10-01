# Bot MCP registration

Run the production server fixtures and focused contract checks:

```sh
node node_modules/vitest/vitest.mjs run server/mcp-registration.e2e.test.ts server/vm-library.e2e.test.ts server/drivers/codex.test.ts server/registered-mcp.test.ts server/mcp-registry.test.ts server/mcp-probe.test.ts server/drivers/agents-proxy.test.ts server/drivers/agents-catalog-wire.test.ts src/lib/mcp-servers.test.ts
```

The registration fixture launches `launchVerificationServer` with a temporary
home, data directory, free ports and fake Claude. `control:omb` creates the bots,
sends requests, waits, interrupts and creates the group conversation. Calls to
`/api/internal/mcp/servers` use the real turn capability delivered to the fake
engine. The proxy contract checks separately drive `list_mcp_servers` and
`register_mcp_server` over MCP stdio.

The fixture proves:

- Full Access registers and tests a server without an extra approval. The grant
  is seeded only in the stopped fixture's saved bot record and loaded on restart.
- Ask mode creates an Allow/Deny card before probing or saving. Deny saves
  nothing; Allow saves; Stop cancels an unanswered request.
- Malformed, reserved, conflicting and unassigned-VM registrations are refused.
  A failed handshake is not saved. Expired turn capabilities cannot register.
- Environment values are not returned in listings or tool descriptions.
- Registration persists through a server restart, grants only its owner access,
  and updates an explicit per-bot server selection.
- Direct and group turns automatically continue with fresh MCP configuration
  after the registering turn ends, including bots with computer access disabled.

The VM-library fixture additionally uses the real production control endpoint
for direct and group registration. A failed guest handshake must leave the
mounted computer credential unchanged and usable; a successful registration
must do the same, then resume with the VM wrapper mounted. Direct registration
is tested before any screen call, so it also proves the first VM claim works.
The guest process alone is simulated in this fixture. Codex driver checks prove
that trusted VM wrappers are accepted, copied/user-supplied reserved credentials
are rejected, and multiple servers receive separate payloads without putting
secrets on argv.

Each run prints its retained evidence JSON and server log path under the system
`openmausbot-verification-evidence` directory. Provider environments and turn
tokens are excluded from evidence. Every owned process and temporary data
folder is cleaned up.

For the real Local VM bridge, with Docker and the managed desktop image already
available, explicitly run:

```sh
node --experimental-strip-types scripts/verify-registered-vm-mcp.ts --docker
```

This starts an isolated production server and one uniquely named disposable
Docker VM. A synthetic Python MCP server runs in that VM as `cua`, in the guest
workspace. Discovery (including Codex’s namespaced payload) and a real tool call verify
the guest path and environment.
A loopback control stub then holds the VM: tool calls and new MCP launches must
be blocked. A deliberately invalid guest `NODE_OPTIONS` proves it never reaches
the host Node process. The script removes its exact container and workspace and
prints a retained evidence path. It does not touch the user's VMs, launch a
browser, or capture screenshots.

Scope: these fixtures prove registration, mounting, approvals and the VM bridge.
They do not prove a third-party MCP package works or visually verify the settings
panel. Registered VM commands mount only with their owner's selected, permitted
VM. The settings panel labels these entries and avoids testing guest commands on
the host; the user verifies that presentation.

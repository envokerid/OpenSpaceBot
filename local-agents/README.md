# Local OpenClaw and Hermes

Independent installations for this checkout. Run the commands below from the
OpenMausBot project root. Always use these wrappers so configuration and login
credentials stay with this installation.

## Sign in with ChatGPT

Each application needs its own login. These commands print a URL and a device
code; complete each login in your browser.

```sh
./local-agents/bin/openclaw models auth login --provider openai --device-code --set-default
./local-agents/bin/hermes auth add openai-codex --type oauth --no-browser
```

Both ChatGPT logins have been completed. Hermes is configured for the
`openai-codex` provider and `gpt-6-sol`. OpenClaw's login selected
`openai/gpt-6-astra`, and its Codex runtime plugin is enabled.

## Mobile dashboards and background services

Connect your phone's Tailscale app to the same tailnet, then open:

- OpenClaw: <https://orca-mcp.tail2b9900.ts.net:9443/>
- Hermes: <https://orca-mcp.tail2b9900.ts.net:9444/>

OpenClaw accepts the owner's Tailscale identity, automatically enrolls browser
devices with normal operator scopes, and grants the owner admin access for the
connection. Its loopback-only listener trusts the local Tailscale proxy.
Hermes requires username `david` and the password in [access.local](access.local).
That file is mode 0600 and Git-ignored; Hermes stores a scrypt password hash.

Both gateways and the Hermes dashboard are running as persistent systemd user
services. OpenClaw serves its dashboard from its gateway. They restart after a
crash or reboot; user lingering is already enabled on this machine. Keep this
computer awake and connected for phone access. Hermes has no messaging channels
configured, so its gateway currently runs its scheduler.

```sh
systemctl --user status openmaus-openclaw openmaus-hermes-dashboard openmaus-hermes-gateway
systemctl --user restart openmaus-openclaw openmaus-hermes-dashboard openmaus-hermes-gateway
journalctl --user -u openmaus-openclaw -u openmaus-hermes-dashboard -u openmaus-hermes-gateway -f
```

Tailscale Serve terminates HTTPS and proxies ports `9443` and `9444` to
`127.0.0.1:18789` and `127.0.0.1:9119`. These two routes are tailnet-only.
Existing routes on ports 443 and 8443 are preserved. See
[Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) and
[Hermes reverse-proxy authentication](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard).

To stop these services and remove only their Tailscale routes:

```sh
systemctl --user disable --now openmaus-openclaw openmaus-hermes-dashboard openmaus-hermes-gateway
tailscale serve --https=9443 off
tailscale serve --https=9444 off
```

## Terminal clients

Start Hermes in the current directory:

```sh
./local-agents/bin/hermes
```

Connect a terminal client to the running OpenClaw gateway:

```sh
./local-agents/bin/openclaw tui
```

The OpenClaw workspace is `local-agents/openclaw/workspace/`. Browser automation
is disabled in OpenClaw and the optional browser download was skipped in Hermes.

To make both commands available in the current shell only:

```sh
export PATH="$PWD/local-agents/bin:$PATH"
```

## Files

| Path | Purpose |
| --- | --- |
| `bin/` | Project-local launchers |
| `openclaw/runtime/` | OpenClaw npm installation and private Node runtime |
| `openclaw/state/` | OpenClaw config, credentials, sessions |
| `openclaw/workspace/` | OpenClaw agent workspace |
| `hermes/source/` | Official Hermes source checkout and built interfaces |
| `hermes/state/` | Hermes config, credentials, tools, Python environments, sessions |
| `cache/` | Installation caches |
| `installers/` | Downloaded official installers and installation/diagnostic logs |
| `services/` | systemd user service definitions, linked into `~/.config/systemd/user/` |
| `access.local` | Private mobile access information and Hermes dashboard password |
| `verify-dashboards.py` | Disposable startup and authentication smoke fixture |

Runtime files, source checkout, caches, and credentials are Git-ignored.
Shell startup files and the OpenMausBot dependency manifests were not changed.
These installs are standalone; they have not been connected to OpenMausBot's
running server. Reinstall after moving the project: managed runtimes contain
absolute paths.

## Checks

```sh
./local-agents/bin/openclaw --version
./local-agents/bin/openclaw config validate
./local-agents/bin/openclaw models status --check
./local-agents/bin/hermes --version
./local-agents/bin/hermes config check
./local-agents/bin/hermes auth status openai-codex
```

CLI startup, configuration, and saved authentication were checked during
installation. OpenClaw's auth/runtime readiness check passes. The isolated
dashboard fixture checks both gateway processes, Hermes login enforcement and
password rejection, and OpenClaw WebSocket owner allowlisting. Fixture evidence
is in `installers/dashboard-smoke.log`. Both live HTTPS routes were checked
through Tailscale with certificate validation; OpenClaw's authenticated
WebSocket handshake passed through that proxy. Live model conversations and mobile
visual layout were not tested. Hermes doctor also reports
optional unconfigured integrations and upstream npm audit findings, including
the lockfile for the uninstalled browser tools; see
`installers/hermes-doctor.log` for the diagnostic report.

Installed from the official [OpenClaw local-prefix installer](https://docs.openclaw.ai/install)
and [Hermes source installation](https://hermes-agent.nousresearch.com/docs/getting-started/installation).
OpenClaw: `2026.9.6` with Node `24.21.0`. Hermes:
`v0.21.5+2453.gd0288be`, commit `d0288be5b3330d2442e3907185b8e9d0958297bb`,
with Python `3.14.7`.

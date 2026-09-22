# Workspace settings from Expo

Open **Settings → Workspace settings**. These controls administer the connected
workspace. Provider keys are write-only; saving one does not download its previous
value to the phone. Local appearance, activity detail, quick replies, notifications
and saved connections remain in the main Settings screen.

For desktop companions, enable **Manage workspace settings** for the paired phone
in the desktop's **Settings → Remote access**. The standalone companion control
page has the same per-device switch. Existing and newly paired devices start with
this grant off. Hosted connections require an administrator session. An updated
desktop/companion is required for this new administration surface.

## Coverage

| Desktop setting | Expo equivalent |
| --- | --- |
| Profile, language, group turn timeout, concurrent threads | Workspace settings → General |
| Desktop updates | General → Desktop app updates, when connected through Electron |
| Appearance, thread visibility, onboarding replay | Main Settings → Appearance, Chat, About; all eight desktop color palettes plus system appearance |
| Saved workspace connections | Main Settings → Computer / Other computers; connections belong to this phone |
| Provider keys, key tests, OpenAI-compatible URL, VPS alias | Connections |
| Engine status, install/update, authentication, model refresh | Engines |
| CLI overrides, detected programs, Claude account creation/edit/removal, tool calls, provider icons | Engines → Advanced settings |
| Skill authoring, built-in browser, browser profiles, tool details | Experimental |
| Voice providers, keys, voice catalog/preview, avatar generation providers | Voice & images |
| Local VM lifecycle, isolation/limits, cloud and VPS inventories | Computers |
| Usage periods/grouping, CSV, budgets, model sell prices | Usage; entitlement-dependent controls follow the server |
| Administrators, members/domains, session revocation | People |
| Server pairing, custom domains | Remote access |
| Desktop device grants, phone pairing, keep awake, Tailscale refresh, remote account sign-in/sign-out, remote access shutdown | Remote access, when connected through Electron |
| Organization enrollment/disconnection, cloud backup creation/list/preview/restore/delete, daily schedule | Organization, when connected through Electron |
| Encrypted workspace export/download/upload/preview/restore | Backups |
| Fleet create/suspend/resume/delete, people, upgrades | Hosted workspaces, when available and entitled |

Workspace language updates the server's language preference; the Expo interface
currently uses English. Expo collects no usage analytics, so it does not offer an
analytics toggle. Phone updates use its distribution channel. Installing an OS
container runtime or a Linux desktop update that requires a terminal still needs
the computer, as on desktop. After a workspace restore, restart the connected
OpenMausBot app/server. Turning off desktop remote access deliberately disconnects
phones; it must be enabled again on the computer.

The administration grant covers explicit routes and a fixed list of existing
desktop handlers. It does not expose arbitrary IPC or arbitrary API routes.
Revocation closes active administrative transfers as well as event streams.
Unknown routes, ordinary chat tokens and hosted member sessions remain restricted.
Native desktop credentials and saved browser connections are not copied to Expo.

## Verification

Run from the repository root with Node 24:

```sh
node --experimental-strip-types expo/scripts/verify-settings.ts
pnpm exec vitest run companion/test electron/updater.test.mjs
node --test electron/mobile-settings.node-test.mjs electron/local-origin.node-test.mjs
pnpm build:companion
xvfb-run -a node --experimental-strip-types scripts/verify-companion-ports.mjs
npm run typecheck --prefix expo
npm test --prefix expo
npm run export --prefix expo
```

The settings fixture accepts no live URL. It owns a temporary harness, home,
fake engine and companion registry. It checks default denial, grant persistence,
settings persistence, stale/invalid writes, secret redaction/removal, engine icon
changes, usage/CSV, hosted member denial/session revocation, backup round-trip and
confirmed restore staging. It reuses the backup fixture's excluded provider home
so credential-storage safety checks remain active. All owned processes and data
are removed on exit; JSON evidence stays beside the printed log.

Use `--interactive` for native UI testing against a **new, disposable emulator**.
The fixture prints its pairing link and accepts `pair`, `grant`, `revoke`, and
`config`. The latter records resulting server state after UI saves. Ctrl-C closes
the exact fixture. Never use the user's emulator, running app or saved connection.

The Electron companion fixture exercises the real utility-process bridge against
synthetic registered settings handlers: permission denial, grant, request/result
delivery, rejection of unrelated IPC, and revocation. It does not enroll a real
organization, upload a real cloud backup, or install a desktop update.

Verified on 2026-09-22:

- Server workflow and confirmed restore evidence:
  `/tmp/openmausbot-verification-evidence/server-1790062453639-554919.log.settings.json`.
- Android 36 native screenshots, XML and action commands:
  `/tmp/omb-settings-native-c59bopsi/`. The isolated phone exercised denied access,
  grant refresh, profile and turn-duration saves, invalid duration feedback,
  write-only key entry, engine advanced settings, section search/navigation,
  VM/usage/people/remote/voice screens, and encrypted backup export to the Android
  share sheet. No file was sent to a share target.
- Native UI server-state evidence:
  `/tmp/openmausbot-verification-evidence/server-1790062587574-562876.log.settings.json`.
- Electron bridge evidence: `/tmp/omb-settings-electron.log`.
- TypeScript, lint, desktop regression tests, companion tests, Expo tests, and
  Android/iOS/web bundle exports passed. Native iOS runtime, real provider login,
  real VM lifecycle, organization/cloud backup transfers, fleet operations and
  desktop update installation still require their platform/service acceptance
  checks. None were exercised against a live account or workspace.

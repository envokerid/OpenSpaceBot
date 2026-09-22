# OpenMausBot Expo companion

One React Native / Expo app for Android and iOS. It talks to the **existing
desktop companion sidecar** and directly paired standalone servers. The desktop
remains responsible for agents, transcripts, credentials, and computers.

The original `android/` and `ios/` apps remain available for comparison. This
app installs separately as `com.openmausbot.companion.expo`; its pairing tokens
and preferences are separate. **This is a port of the core companion workflows,
not yet a replacement with every native feature.** See the parity table below.

## Run

Use Node 24 or newer. Install the repository dependencies from the repository
root first (`pnpm install --frozen-lockfile`), then:

```sh
cd expo
npm ci
npm run android
# On macOS with Xcode:
npm run ios
```

These commands generate `expo/android/` or `expo/ios/` and build a development
client. Subsequent JavaScript-only changes need just `npm start`. Rebuild after
changing native dependencies or app plugins. Generated projects are ignored;
the sibling native apps in the repository root are never overwritten.

For an Expo Go preview, run `npm run go` and scan the terminal QR code using
an Expo Go version compatible with SDK 57. Dictation, notifications and incoming
sharing are disabled there; you can still type messages and pair with the desktop. Use a
development build for speech recognition, native share targets, app links and
full native acceptance. The app uses [Expo SDK 57](https://expo.dev/changelog/sdk-57).

For installable previews, run from `expo/` in an EAS-configured checkout:

```sh
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
```

Signing and an EAS project belong to the maintainer; this change does not create
accounts, upload builds, or change the existing store apps. The preview profile
produces an Android APK; iOS device distribution needs Apple signing.

## Connect to the desktop

1. In desktop OpenMausBot Settings, enable **Phone access** and show its QR code.
2. Scan it in Expo, inspect the displayed computer/address, then tap **Connect**.
3. Alternatively enter the displayed address and six-digit code. An address
   without a scheme or port defaults to `http://ADDRESS:8810`.
4. For a standalone server, paste its `https://HOST/pair#code=…` link, or enter
   its full URL and twelve-character pairing code.

The phone must be able to reach that address. Use the computer's LAN address,
Tailscale MagicDNS name, or the desktop's HTTPS route. `localhost` on a phone is
the phone itself; Android emulators can use `10.0.2.2` for the host, or a
fixture-specific `adb reverse` mapping. Keep the desktop awake.

The native client sends the bearer in an Authorization header. Device tokens
live in Expo SecureStore; AsyncStorage contains only connection metadata. QR
credentials are exchanged once and never persisted. HTTPS/Tailscale pairings
cannot silently downgrade to LAN HTTP. A local pairing permits only the exact
local origin confirmed by the person, plus the protected routes in that invite.
HTTP redirects are refused when sending credentials. Revocation stops retries.

`npm run web` is a **UI preview only**. The production companion intentionally
rejects browser Origin headers. Web preview tokens are memory-only. Do not
relax the sidecar's browser policy to turn this into a hosted web client.

## Port coverage

| Workflow | Expo implementation |
| --- | --- |
| Pairing and computers | QR, deep links, manual LAN/Tailscale/HTTPS, server pairing, multiple computers, forgetting tokens, invited-route fallback |
| Chats | Bots, channels, shared sections, unread/working/waiting updates, paged history, transcript search and export, Markdown, tool details, reactions, editing messages and version navigation |
| Streaming | Native streaming fetch, cursor replay, rehydration after gaps, EOF recovery, foreground lifecycle, polling snapshots when streaming fails |
| Threads | Phone-local bot selection, folder-name search, create/rename/archive/delete, per-thread drafts/attachments, model selection, pinned send/read/Stop |
| Approvals | Permission choices, remembered grants, free-text and structured questions, complete skill preview/hash, profile/team/routine proposal review |
| Attachments | Photo/document pickers, uploads with size limits, generated images, message-scoped downloads, native share-out and share-in to a reviewed draft |
| Identity | Shared mascot geometry, body catalog and colors; custom avatar upload/crop/generation; editable profile and standing instructions |
| Bot permissions | Bot settings → Permissions: Chief of Staff, additional teams, teammate-contact approval, provider-supported Ask/Edits/Auto defaults and local-computer warning; Full/Custom remain desktop-only |
| Routines | List and run receipts; interval/daily/once editor and daily weekdays; bot targets; pause/resume, run/delete; existing cron and interval restrictions preserved |
| Computer | Thread-specific VM/cloud preview while idle or working; saved-capture fallback, retry, and explicit cloud desktop launch with per-device authorization |
| Voice and alerts | Native composer dictation; provider voice preview; local notification banners while connected in development builds |

Still needed before replacing the native apps: Bonjour auto-discovery and
refreshed endpoint metadata; phone-side HPKE credential entry; the complete
animated mascot; routine context attachment editing and the calendar grid;
batch thread operations; connected-app account management screens; Walkie/automatic spoken replies; iOS widgets/Live Activities
and platform-specific notification actions. Credential cards currently direct
the person to enter the credential on the desktop, then resume from the phone.

Drafts are retained per thread while this app process runs; transcripts and
drafts are not copied into persistent phone storage. There is no background
push service. iOS share-in opens the app to review its destination and draft;
it does not reproduce the existing standalone Swift Share extension UI.

See the [screen comparison record](verification/ui-parity.md) for Android screenshots,
verified fixture interactions and remaining UI gaps. iOS simulator comparison
has not been possible without macOS/Xcode.

## Verify

```sh
cd expo
npm run typecheck
npm test
npm run export
npx expo install --check
```

Run the real desktop-connection checks from the repository root:

```sh
node --experimental-strip-types expo/scripts/verify-server.ts
```

The script launches its own `control-omb` fixture and a real companion proxy
with an isolated device registry. It exercises the production Expo protocol
client against them: QR pairing, route restrictions, local thread selection,
send/stream/wait, idempotent retries, read/rename/search, upload, reconnect,
message edits/version switching, avatar upload/profile updates, routine CRUD,
and a live permission-broker approval followed by a settled engine reply.
It verifies revocation, writes redacted action/state evidence next to the
fixture's persistent server log, and tears down only its owned resources.

Pass `--interactive` to keep that fixture alive for an emulator check after
the automated steps. It prints a fresh, short-lived pairing code and URL. Enter `pair` to refresh it.
Interrupt that exact process with Ctrl-C for cleanup. Never use the user's
running desktop or pairing registry as test data.

See [verification details](../docs/verification/expo-companion.md) for what the
checks prove and what still needs native device acceptance.

## Layout

- `App.tsx`: lifecycle, computer switching, navigation, notifications and share-in.
- `src/core/`: UI-independent pairing, HTTP client, SSE framing, state fold and
  session recovery; wire types imported from `shared/wire.ts`.
- `src/`: shared native screens, Markdown/cards, attachments and dictation.
- `tests/`: protocol/security/recovery tests, including the existing native
  apps' captured server fixtures.
- `scripts/verify-server.ts`: disposable real server/companion workflow checks.

The npm lockfile isolates mobile React and Expo versions from the desktop's
pnpm workspace. Metro watches shared sources but resolves native dependencies
from `expo/node_modules`, preventing two React copies in the app.

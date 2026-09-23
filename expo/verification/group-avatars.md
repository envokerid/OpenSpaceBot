# Group message avatars

Group reply bubbles resolve the sender's current bot profile by `from.botId`
and show a 24px avatar beside the name. The existing avatar component supports
uploaded images, crop settings and mascots. Removed bots fall back to the name
and color saved with the message. Long names wrap without shrinking the avatar,
and profile updates refresh memoized bubbles.

Verified on 2026-09-22:

- `cd expo && npm run typecheck && npm test`: TypeScript and all 38 tests passed.
- `node_modules/.bin/oxlint --deny-warnings expo/src/Avatar.tsx expo/src/Chat.tsx expo/src/Messages.tsx`: passed.
- `node --experimental-strip-types expo/scripts/verify-server.ts`: isolated
  server/companion checks passed, including group sends. Evidence:
  `/tmp/openmausbot-verification-evidence/server-1790068001413-802369.log.expo.json`.
- A disposable headless browser rendered the real MessageBubble, SpeechBubble
  and Avatar components through React Native Web with synthetic messages and
  a local PNG. Checks covered mascot/custom avatars, removed-bot fallback,
  long-name sizing, unchanged user/direct replies and a profile update while
  keeping the message object unchanged. No page errors occurred. Fixture,
  commands, assertions and inspected screenshots:
  `/tmp/omb-group-avatar-check/` (`build.cjs`, `check.cjs`, `results.json`,
  `before.png`, `updated.png`).

The fixtures used no live app data and were stopped afterward. Native Android
and iOS rendering was not exercised.

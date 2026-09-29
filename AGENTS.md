# OpenMausBot agent notes

For UI changes, run relevant automated tests and leave visual verification to
the user. Do not launch UI fixtures, emulators, browsers, or screenshot checks
unless the user asks.

Before claiming a server or conversation behavior change works, follow
[`docs/verification/README.md`](docs/verification/README.md). Always launch an
isolated fixture; never verify mutations against the user's live app or data.

More specific `AGENTS.md` files override this note within their directories.

## Reopening David's saved Expo emulator

When David asks for the emulator titled **OpenMausBot** with the app already
remembered, use the saved `omb_expo_session` AVD, **not** `Pixel_7_API_36`.
This is the user's retained app session, not a disposable verification fixture.
Do not wipe its data, reinstall/clear the app, or use it to test mutations.

The working setup restored on 2026-09-28 runs the emulator **headless** and
shows it through **scrcpy**, with the window title `OpenMausBot`. The ordinary
Android emulator window had repeated not-responding problems. Keep the
headless/scrcpy workaround; changing only GPU settings on the generic Pixel
AVD does not restore this saved session.

Local paths (check they still exist; the AVD currently lives under `/tmp` and
may disappear after cleanup or a reboot):

- AVD registry: `/tmp/omb-expo-avd-X2GCv1/avds`
- Saved device data: `/tmp/omb-expo-avd-X2GCv1/device.avd`
- Android SDK: `/home/david/Android/Sdk`
- scrcpy: `/home/david/.local/share/openmausbot-tools/scrcpy-linux-x86_64-v4.1/scrcpy`
- App package: `com.openmausbot.companion.expo`

First inspect `adb devices -l` and the running emulator/Metro/scrcpy processes.
Reuse the matching session when already running. Port 5554 must be free before
starting this AVD; do not stop an unrelated emulator automatically. If the
saved paths are missing, search for `omb_expo_session.ini` before creating
anything, and explain if the retained device cannot be found.

Start the saved emulator in a persistent terminal or detached process:

```sh
env -u QT_PLUGIN_PATH -u QT_QPA_PLATFORM_PLUGIN_PATH -u LD_LIBRARY_PATH \
  ANDROID_AVD_HOME=/tmp/omb-expo-avd-X2GCv1/avds \
  QT_QPA_PLATFORM=xcb \
  /home/david/Android/Sdk/emulator/emulator \
  -avd omb_expo_session -no-window -no-snapshot \
  -gpu host -feature -Vulkan -memory 2560 -port 5554
```

Wait until `adb -s emulator-5554 shell getprop sys.boot_completed` returns `1`
before opening the app. Cold boot can take about a minute. `-no-snapshot`
disables snapshot loading/saving; it does not wipe the saved app data.

Reuse Metro at port 8081 if it belongs to this checkout. Otherwise start
`npm start -- --port 8081` from this repo's `expo/` directory in a persistent
terminal. Then restore the connection and open the development client:

```sh
adb -s emulator-5554 reverse tcp:8081 tcp:8081
adb -s emulator-5554 shell am start \
  -a android.intent.action.VIEW \
  -d 'exp+openmausbot-companion://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' \
  -p com.openmausbot.companion.expo
```

Start the display in a persistent terminal or detached process:

```sh
/home/david/.local/share/openmausbot-tools/scrcpy-linux-x86_64-v4.1/scrcpy \
  --serial emulator-5554 --window-title OpenMausBot \
  --max-size 1280 --max-fps 30 --no-audio
```

Confirm the app finishes loading and the saved connection is present before
reporting success. Do not claim the workaround guarantees no future hangs.

# Android real-device checks

Scripts that drive a USB-connected Android phone with adb and Chrome DevTools, for tickets 06 (touch), 14 (PWA)
and 15 (performance). They need Node 22+, adb (on PATH, in the WinGet location or set by `ADB=`), USB debugging
allowed, the phone unlocked and kept awake (Developer options > Stay awake), and Chrome on the phone.

Screenshots and `*-results.json` go to `DEVICE_OUT` (default: `<tmp>/penrose-device`), never into the repo.
Each script exits non-zero if a check fails and refuses to start below `MIN_BATTERY` (5 %).

| npm script | checks | serve first |
|---|---|---|
| `npm run device:touch` | 06: tray drag + snap, release on nothing / on the tray, tap to turn, drag to the tray to remove, pan, pinch, flow-mode place; probes for long-press selection, double-tap zoom, pull-to-refresh; the folded phone menu | `npm run build && npx vite preview --host 127.0.0.1 --port 4173` |
| `npm run device:pwa` | 14: install from Chrome's menu, launch from the home-screen icon (standalone window), dialog fits, offline relaunch + play | same as above |
| `npm run device:perf` | 15: `bench.html` (5000 tiles: pan, zoom, 50 timed places), optional args `runs` and a query string | `npm run build:bench && npm run preview:bench -- --host 127.0.0.1 --port 4174` |

`--host 127.0.0.1` matters: `adb reverse` connects over IPv4, and `vite preview` on `localhost` may listen on IPv6
only. The scripts set up `adb forward tcp:9222 localabstract:chrome_devtools_remote` and `adb reverse tcp:4173`;
`http://localhost` on the phone is a secure context, so the service worker and install work without HTTPS.

## How touches are made

Only `input tap` and `input swipe` reach Chrome on the test phone (ASUS ZenFone 5Z, Android 10). Its
`input touchscreen event DOWN|MOVE|UP` runs but delivers nothing, and `sendevent` into the touchscreen node is
denied by SELinux. So every one-finger gesture is a real straight-line swipe, and the page is inspected through CDP
while the swipe is still running (preview and drop-target state, screenshots). Gestures a straight line cannot
make use CDP `Input.dispatchTouchEvent`: the two-finger pinch and carrying a tile out over the tiling and back
onto the tray. Coordinates are mapped CSS px to device px with one calibration tap.

## What the PWA script changes on the phone

- It installs the app. If Chrome cannot mint a WebAPK (on the test phone, Play services failed with "User needs to
  (re)enter credentials"), Chrome pins a plain web-app shortcut instead; the script accepts the launcher's
  confirmation. The shortcut stays installed; remove it with long press > Remove, or by dragging it to Remove.
- It force-stops Chrome twice, to cold-start the app from its icon.
- Offline: it removes the adb reverse and turns Wi-Fi and mobile data off, then turns back on whatever was on
  and restores the reverse, in a `finally`.

The touch script clears the service worker and cache of `localhost:4173` before it starts (so it tests the build
being served; an installed copy of the app then needs one online launch to be offline-ready again) and starts a new game there. The perf script clears everything stored for `localhost:4174` and closes
its tab when done.

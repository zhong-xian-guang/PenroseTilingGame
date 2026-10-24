// Shared helpers for the Android real-device scripts: adb, Chrome DevTools Protocol (CDP) over
// `adb forward`, screenshots, and CSS-px <-> device-px mapping. See README.md in this folder.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const WINGET_ADB = join(
  homedir(),
  'AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb.exe',
);
export const ADB = process.env.ADB ?? (existsSync(WINGET_ADB) ? WINGET_ADB : 'adb');
export const CDP_PORT = Number(process.env.CDP_PORT ?? 9222);
export const APP_PORT = Number(process.env.APP_PORT ?? 4173);
export const APP_URL = process.env.APP_URL ?? `http://localhost:${APP_PORT}/`;
/** Screenshots and logs go here (never into the repo). */
export const OUT = process.env.DEVICE_OUT ?? join(tmpdir(), 'penrose-device');
mkdirSync(OUT, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(...a);

export function adb(...args) {
  const r = spawnSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`adb ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}
export const shell = (cmd) => adb('shell', cmd);

/** Saves a PNG of the phone screen to OUT/<name>.png and returns its path. */
export function screencap(name) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20 });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, png);
  return file;
}

/** Battery level and charging state; throws when it is too low to run a test safely. */
export function checkBattery(min = Number(process.env.MIN_BATTERY ?? 5)) {
  const s = shell('dumpsys battery');
  const level = Number(/level: (\d+)/.exec(s)?.[1]);
  const charging = /status: 2/.test(s);
  if (level < min) throw new Error(`battery at ${level}% (min ${min}%): charge the phone first`);
  return { level, charging };
}

/** CDP to the phone's Chrome: `adb forward tcp:9222 localabstract:chrome_devtools_remote` and the app port reversed. */
export function setupForwards() {
  adb('forward', `tcp:${CDP_PORT}`, 'localabstract:chrome_devtools_remote');
  adb('reverse', `tcp:${APP_PORT}`, `tcp:${APP_PORT}`);
}

/** Chrome's DevTools targets; [] while Chrome is not running. */
export async function cdpTargets() {
  try {
    return await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  } catch {
    return [];
  }
}

/** Opens `url` in a new Chrome tab on the phone (or reuses a tab already on it) and connects to it. */
export async function openPage(url = APP_URL, { reuse = true } = {}) {
  let target = reuse ? (await cdpTargets()).find((t) => t.type === 'page' && t.url.startsWith(url)) : undefined;
  if (!target) {
    // Chrome on Android refuses /json/new; open the URL with an intent instead and wait for its tab
    shell(`am start -a android.intent.action.VIEW -d '${url}' -n com.android.chrome/com.google.android.apps.chrome.Main`);
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(250);
      target = (await cdpTargets()).find((t) => t.type === 'page' && t.url.startsWith(url));
    }
    if (!target) throw new Error(`no Chrome tab on ${url}`);
  }
  shell('am start -n com.android.chrome/com.google.android.apps.chrome.Main >/dev/null'); // Chrome to the front
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/activate/${target.id}`);
  await sleep(800);
  const page = await connect(target.webSocketDebuggerUrl);
  await page.send('Page.bringToFront');
  return page;
}

/** Connects to a CDP page. `send`, `ev` (Runtime.evaluate, awaits promises), `errors` (exceptions seen). */
export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const waiting = new Map();
  const errors = [];
  const listeners = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description);
    if (d.method) for (const l of listeners) l(d);
    if (d.id && waiting.has(d.id)) {
      waiting.get(d.id)(d);
      waiting.delete(d.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      waiting.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { ws, send, ev, errors, on: (l) => listeners.push(l), close: () => ws.close() };
}

/**
 * Finds how CSS px map to device px by tapping the screen centre and reading the pointerdown that
 * arrives (the browser toolbar shifts the page down by an unknown amount). Returns {dpr, top, left}.
 */
export async function calibrate(page, at = null) {
  const dpr = await page.ev('devicePixelRatio');
  const size = /Physical size: (\d+)x(\d+)/.exec(shell('wm size'));
  const W = Number(size[1]);
  const H = Number(size[2]);
  const [x, y] = at ?? [Math.round(W / 2), Math.round(H * 0.45)];
  await page.ev(`(window.__cal = null, addEventListener('pointerdown', (e) => (window.__cal = [e.clientX, e.clientY]), { once: true, capture: true }), true)`);
  shell(`input tap ${x} ${y}`);
  await sleep(400);
  const cal = await page.ev('window.__cal');
  if (!cal) throw new Error('calibration tap did not reach the page');
  return { dpr, left: x - cal[0] * dpr, top: y - cal[1] * dpr, W, H };
}

/** CSS px (client coordinates) -> device px for `adb shell input`. */
export const toDevice = (cal, [x, y]) => [Math.round(cal.left + x * cal.dpr), Math.round(cal.top + y * cal.dpr)];

// ---- real touches ----
// Only `input tap` and `input swipe` reach Chrome on the test phone (ASUS, Android 10): its
// `input [touchscreen] event DOWN|MOVE|UP` runs but delivers nothing, and `sendevent` into the
// touchscreen node is refused by SELinux. So a one-finger gesture is a straight-line swipe (the finger
// lifts at its end), observed while it runs; anything a straight line cannot do (multi-touch, a path
// that turns back) uses CDP Input.dispatchTouchEvent instead.

/** Tap at p (device px). */
export const tap = (p) => shell(`input tap ${Math.round(p[0])} ${Math.round(p[1])}`);

/** Long press: a zero-length swipe held for `ms`. */
export const longPress = (p, ms = 1200) => shell(`input swipe ${p[0]} ${p[1]} ${p[0]} ${p[1]} ${ms}`);

/**
 * Swipe from a to b (device px) over `ms`, then lift. `during(t)` is awaited at about t ms into the
 * swipe so the page can be inspected mid-gesture (adb latency makes the timing approximate).
 */
export async function swipe(a, b, ms, during = null, at = ms * 0.9) {
  const child = spawn(ADB, ['shell', `input swipe ${a[0]} ${a[1]} ${b[0]} ${b[1]} ${ms}`]);
  const done = new Promise((r) => child.on('exit', r));
  let seen;
  if (during) {
    await sleep(at);
    seen = await during();
  }
  await done;
  return seen;
}

/** CDP touch: one or two fingers along given CSS-px paths (arrays of [x,y]), `frameMs` apart. */
export async function cdpTouch(page, paths, frameMs = 16) {
  const n = Math.max(...paths.map((p) => p.length));
  const pts = (i) => paths.map((p, id) => ({ x: p[Math.min(i, p.length - 1)][0], y: p[Math.min(i, p.length - 1)][1], id }));
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
  for (let i = 1; i < n; i++) {
    await sleep(frameMs);
    await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i) });
  }
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Points from a to b in `steps` steps (inclusive of a). */
export const line = (a, b, steps = 10) =>
  Array.from({ length: steps + 1 }, (_, s) => [a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);

/** Rect of the first element matching `selector`, in CSS px. */
export async function rect(page, selector) {
  return JSON.parse(await page.ev(`JSON.stringify(document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect() ?? null)`));
}
export const centre = (r) => [r.x + r.width / 2, r.y + r.height / 2];

// ---- Android UI (uiautomator) ----

/** The current screen's UI nodes: {text, desc, id, pkg, bounds:[x0,y0,x1,y1]}. */
export function uiNodes() {
  const xml = shell('uiautomator dump /sdcard/ptg-ui.xml >/dev/null; cat /sdcard/ptg-ui.xml; rm -f /sdcard/ptg-ui.xml');
  const nodes = [];
  for (const m of xml.matchAll(/<node [^>]*>/g)) {
    const a = (k) => new RegExp(`${k}="([^"]*)"`).exec(m[0])?.[1] ?? '';
    const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(m[0]);
    nodes.push({ text: a('text'), desc: a('content-desc'), id: a('resource-id'), pkg: a('package'), bounds: b ? b.slice(1).map(Number) : null });
  }
  return nodes;
}
/** First node whose text or content description matches `re`. */
export const findNode = (re, nodes = uiNodes()) => nodes.find((n) => re.test(n.text) || re.test(n.desc)) ?? null;
/** Taps the centre of a node. */
export const tapNode = (n) => tap([(n.bounds[0] + n.bounds[2]) / 2, (n.bounds[1] + n.bounds[3]) / 2]);
/** Waits up to `ms` for a node matching `re`. */
export async function waitNode(re, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const n = findNode(re);
    if (n) return n;
    await sleep(500);
  }
  return null;
}
/** The activity in front (package/class). */
export const topActivity = () => /mResumedActivity: ActivityRecord\{\S+ \S+ (\S+)/.exec(shell('dumpsys activity activities | grep mResumedActivity'))?.[1] ?? null;

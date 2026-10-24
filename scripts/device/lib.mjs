// Shared helpers for the Android real-device scripts: adb, Chrome DevTools Protocol (CDP) over
// `adb forward`, screenshots, and CSS-px <-> device-px mapping. See README.md in this folder.
import { execFileSync, spawnSync } from 'node:child_process';
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

export async function cdpTargets() {
  return (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
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
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/activate/${target.id}`);
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

/** Real system touch: finger down, moves, up, through `adb shell input event` (one adb call per event). */
export const finger = {
  down: (p) => shell(`input touchscreen event DOWN ${p[0]} ${p[1]}`),
  move: (p) => shell(`input touchscreen event MOVE ${p[0]} ${p[1]}`),
  up: (p) => shell(`input touchscreen event UP ${p[0]} ${p[1]}`),
};

/** Several MOVE events from a to b, sent in one adb call. */
export function moveAlong(a, b, steps = 8) {
  const cmds = [];
  for (let s = 1; s <= steps; s++) {
    const x = Math.round(a[0] + ((b[0] - a[0]) * s) / steps);
    const y = Math.round(a[1] + ((b[1] - a[1]) * s) / steps);
    cmds.push(`input touchscreen event MOVE ${x} ${y}`);
  }
  shell(cmds.join(' && '));
}

/** Rect of the first element matching `selector`, in CSS px. */
export async function rect(page, selector) {
  return JSON.parse(await page.ev(`JSON.stringify(document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect() ?? null)`));
}
export const centre = (r) => [r.x + r.width / 2, r.y + r.height / 2];

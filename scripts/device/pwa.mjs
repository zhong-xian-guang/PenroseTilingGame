// Ticket 14 on a real Android phone: install the app from Chrome's menu, launch it from its home-screen icon,
// check that it runs standalone (its own WebAPK activity, display-mode: standalone), then go offline
// (adb reverse removed, Wi-Fi and mobile data off), relaunch it and play a tile. Networking and the adb
// reverse are restored in every case (finally). The installed WebAPK is left on the phone: remove it with
// `adb uninstall <package>` (printed at the end) when no longer wanted.
// usage: node scripts/device/pwa.mjs   (serve the production build on APP_PORT first, see README.md)
import {
  adb,
  APP_PORT,
  APP_URL,
  calibrate,
  cdpTargets,
  centre,
  checkBattery,
  connect,
  findNode,
  log,
  openPage,
  OUT,
  rect,
  screencap,
  setupForwards,
  shell,
  sleep,
  swipe,
  tap,
  tapNode,
  toDevice,
  topActivity,
  uiNodes,
  waitNode,
} from './lib.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const results = [];
const check = (name, pass, detail = {}) => {
  results.push({ name, pass: !!pass, ...detail });
  log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail));
};
const webapks = () => new Set(shell('pm list packages org.chromium.webapk').split(/\s+/).filter(Boolean).map((l) => l.replace('package:', '')));
/** Is the app's icon on the (first) home screen? Chrome pins a plain web-app shortcut there when no WebAPK can be minted. */
const homeIcon = async () => {
  shell('input keyevent KEYCODE_HOME');
  await sleep(1500);
  for (let i = 0; i < 6; i++) {
    if (findNode(/^Penrose( Tiling)?$/)) return true;
    shell(i < 3 ? 'input swipe 150 1300 950 1300 250' : i === 3 ? 'input keyevent KEYCODE_HOME' : 'input swipe 950 1300 150 1300 250');
    await sleep(1300);
  }
  return false;
};
const webapkFor = (pkgs) => {
  for (const p of pkgs) if (shell(`dumpsys package ${p}`).includes(`localhost:${APP_PORT}`)) return p;
  return null;
};

log('battery', checkBattery());
setupForwards();

// ---- 1. install from Chrome's menu ----
let pkg = webapkFor(webapks()) ?? ((await homeIcon()) ? 'shortcut' : null);
let installNote = null;
if (pkg) log('already installed as', pkg);
else {
  const page = await openPage(APP_URL);
  await page.send('Storage.clearDataForOrigin', { origin: new URL(APP_URL).origin, storageTypes: 'service_workers,cache_storage' });
  await page.send('Page.reload');
  await sleep(4000);
  log('service worker', await page.ev(`navigator.serviceWorker.ready.then(r => r.active?.state)`));
  page.close();
  const before = webapks();
  tapNode(uiNodes().find((n) => n.id === 'com.android.chrome:id/menu_button'));
  await sleep(1200);
  let item = findNode(/^(安裝應用程式|加到主畫面|Install app|Add to home screen)$/);
  for (let i = 0; i < 3 && !item; i++) {
    shell('input swipe 700 1800 700 700 400');
    await sleep(900);
    item = findNode(/^(安裝應用程式|加到主畫面|Install app|Add to home screen)$/);
  }
  if (!item) throw new Error('no install item in Chrome menu');
  log('menu item', item.text);
  tapNode(item);
  const install = await waitNode(/^(安裝|Install)$/);
  screencap('14-1-install-dialog');
  if (!install) throw new Error('no install dialog');
  tapNode(install);
  for (let i = 0; i < 120 && !pkg; i++) {
    await sleep(1000);
    // no WebAPK (minting needs Play services): Chrome asks the launcher to pin a shortcut, which asks to confirm
    const add = findNode(/^(自動新增|Add automatically|新增|Add)$/);
    if (add?.pkg.includes('launcher')) {
      screencap('14-1b-launcher-confirm');
      tapNode(add);
      await sleep(1500);
      pkg = 'shortcut';
      installNote = shell('logcat -d -t 5000 | grep -E "Error during WebAPK install|not allowed for" | tail -n 2').trim();
    } else pkg = webapkFor([...webapks()].filter((p) => !before.has(p)));
  }  if (!pkg) throw new Error('the app was not installed within 2 minutes');
}
check('installs from Chrome\'s menu onto the home screen', !!pkg, { installedAs: pkg === 'shortcut' ? 'Chrome web-app shortcut (WebAPK minting failed)' : `WebAPK ${pkg}`, installNote });

// ---- 2. launch from the home-screen icon ----
async function launchFromIcon(label) {
  shell('am force-stop com.android.chrome'); // a cold start (the app runs inside Chrome's process)
  shell('input keyevent KEYCODE_HOME');
  await sleep(1200);
  shell('input keyevent KEYCODE_HOME'); // a second HOME goes to the first home page
  await sleep(1200);
  let icon = null;
  for (let pageNo = 0; pageNo < 6 && !icon; pageNo++) {
    icon = findNode(/^Penrose( Tiling)?$/);
    if (!icon) {
      // previous pages first (the launcher pinned it left of the default page), then the following ones
      shell(pageNo < 3 ? 'input swipe 150 1300 950 1300 250' : pageNo === 3 ? 'input keyevent KEYCODE_HOME' : 'input swipe 950 1300 150 1300 250');
      await sleep(1000);
    }
  }
  if (!icon) throw new Error('no Penrose icon on the home screen');
  screencap(`14-${label}-home`);
  tapNode(icon);
  await sleep(5000);
  const activity = topActivity();
  let target = null;
  for (let i = 0; i < 20 && !target; i++) {
    target = (await cdpTargets().catch(() => [])).find((t) => t.type === 'page' && t.url.startsWith(APP_URL));
    if (!target) await sleep(500);
  }
  if (!target) throw new Error('the launched app has no DevTools page');
  const page = await connect(target.webSocketDebuggerUrl);
  return { icon: icon.text || icon.desc, activity, page };
}

const online = await launchFromIcon('2');
await sleep(1500);
const env = JSON.parse(
  await online.page.ev(`JSON.stringify({
    standalone: matchMedia('(display-mode: standalone)').matches,
    fullscreen: matchMedia('(display-mode: fullscreen)').matches,
    innerHeight, innerWidth, dpr: devicePixelRatio,
    hud: document.querySelector('.hud')?.getBoundingClientRect().top,
  })`),
);
const launchShot = screencap('14-2-standalone');
const windowDump = shell(`dumpsys window | grep -E "mCurrentFocus|mFocusedApp"; true`).trim();
check('launches from the home-screen icon into its own standalone window (not a Chrome tab)', /webapk|WebApk|Webapp/i.test(online.activity ?? '') && (env.standalone || env.fullscreen), {
  icon: online.icon,
  activity: online.activity,
  windowDump,
  displayMode: env.standalone ? 'standalone' : env.fullscreen ? 'fullscreen' : 'browser',
  viewport: [env.innerWidth, env.innerHeight, env.dpr],
  shot: launchShot,
});

// status bar / notch: where does the page start on screen?
const cal = await calibrate(online.page, [540, 1500]);
log('page top on screen (device px)', cal.top, 'HUD top (css px)', env.hud);

// dialogs (100dvh) in the installed app: open About from the menu and measure it
await online.page.ev(`document.querySelector('.menu .toggle')?.click(), true`);
await sleep(300);
await online.page.ev(`[...document.querySelectorAll('.menu > button')].at(-1).click(), true`);
await sleep(600);
const dialog = JSON.parse(await online.page.ev(`JSON.stringify((() => { const d = document.querySelector('dialog[open]'); const r = d?.getBoundingClientRect(); return d && { top: r.top, bottom: r.bottom, height: r.height, innerHeight, scrollable: d.scrollHeight > d.clientHeight }; })())`));
screencap('14-3-dialog');
await online.page.ev(`document.querySelector('dialog[open]')?.close(), true`);
check('a dialog fits the installed app\'s viewport', dialog && dialog.top >= 0 && dialog.bottom <= dialog.innerHeight, { dialog, pageTopDevicePx: Math.round(cal.top) });
online.page.close();

// ---- 3. offline: no server, no Wi-Fi, no mobile data ----
const wifiWas = shell('settings get global wifi_on').trim();
const dataWas = shell('settings get global mobile_data').trim();
const airplaneWas = shell('settings get global airplane_mode_on').trim();
log('network before', { wifi: wifiWas, data: dataWas, airplane: airplaneWas });
try {
  adb('reverse', '--remove', `tcp:${APP_PORT}`);
  shell('svc wifi disable');
  shell('svc data disable');
  await sleep(4000);
  const net = shell('dumpsys connectivity | grep -m1 "Active default network"').trim();
  const offline = await launchFromIcon('4');
  await sleep(2500);
  const o = await offline.page;
  const state = JSON.parse(
    await o.ev(`JSON.stringify({ onLine: navigator.onLine, canvas: !!document.querySelector('canvas'), tray: document.querySelectorAll('.tray button').length, tiles: document.querySelector('.hud strong')?.textContent, controller: !!navigator.serviceWorker.controller, fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i) })`),
  );
  // play: carry a kite out of the tray onto the right edge of the tiling (real swipe)
  const ocal = await calibrate(o, [540, 1500]);
  const dev = (p) => toDevice(ocal, p);
  const box = JSON.parse(await o.ev(`JSON.stringify((() => {
    const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const k = c.width / c.getBoundingClientRect().width; let x1 = -1, y0 = 1e9, y1 = -1;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]-127) + Math.abs(d[i+1]-166) + Math.abs(d[i+2]-214) < 30 || Math.abs(d[i]-236) + Math.abs(d[i+1]-188) + Math.abs(d[i+2]-116) < 30) {
      const p = i / 4, x = p % c.width, y = Math.floor(p / c.width); if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x1 / k, (y0 + y1) / 2 / k];
  })())`));
  const pendingPx = () => o.ev(`(() => { const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]-209) + Math.abs(d[i+1]-73) + Math.abs(d[i+2]-91) < 30) n++; return n; })()`);
  const before = await pendingPx();
  const kite = centre(await rect(o, '.tray button'));
  await swipe(dev(kite), dev([box[0] - 6, box[1] + 72]), 2000);
  await sleep(800);
  const after = await pendingPx();
  screencap('14-5-offline-played');
  check('offline: relaunches from the icon, loads and is playable', !state.onLine && state.canvas && state.tray === 2 && state.controller && after > 50, {
    activeNetwork: net,
    activity: offline.activity,
    ...state,
    pendingPx: [before, after],
  });
  o.close();
} finally {
  if (wifiWas === '1') shell('svc wifi enable');
  if (dataWas === '1') shell('svc data enable');
  adb('reverse', `tcp:${APP_PORT}`, `tcp:${APP_PORT}`);
  await sleep(5000);
  log('network after', {
    wifi: shell('settings get global wifi_on').trim(),
    data: shell('settings get global mobile_data').trim(),
    airplane: shell('settings get global airplane_mode_on').trim(),
    active: shell('dumpsys connectivity | grep -m1 "Active default network"').trim(),
    reverse: adb('reverse', '--list').trim(),
  });
}
shell('input keyevent KEYCODE_HOME');
writeFileSync(join(OUT, '14-results.json'), JSON.stringify({ package: pkg, results }, null, 2));
log(`results in ${OUT}; remove the test install: ${pkg === 'shortcut' ? 'long-press the Penrose icon > Remove' : `adb uninstall ${pkg}`}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);

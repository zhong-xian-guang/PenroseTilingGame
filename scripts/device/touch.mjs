// Ticket 06 on a real Android phone. One-finger flows use real system touches (`adb shell input tap/swipe`,
// observed mid-gesture through CDP); the two-finger pinch and the "out and back onto the tray" path, which a
// straight swipe cannot do, use CDP touch events. Also probes long press, double-tap zoom and pull-to-refresh.
// State is read through CDP (HUD, canvas pixels); screenshots and 06-results.json go to DEVICE_OUT.
// Starts a new game on the phone. usage: node scripts/device/touch.mjs   (see README.md)
import {
  APP_URL,
  calibrate,
  cdpTouch,
  centre,
  checkBattery,
  line,
  log,
  longPress,
  openPage,
  OUT,
  rect,
  screencap,
  setupForwards,
  shell,
  sleep,
  swipe,
  tap,
  toDevice,
} from './lib.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

log('battery', checkBattery());
setupForwards();
const page = await openPage(APP_URL);
// drop the service worker and its cache so the page runs the build being served now (the app's own update
// strategy would wait until every window of it is closed); the saved games in IndexedDB are kept
await page.send('Storage.clearDataForOrigin', { origin: new URL(APP_URL).origin, storageTypes: 'service_workers,cache_storage' });
await page.send('Page.reload');
await sleep(3000);
const cal = await calibrate(page, [540, 1500]);
log('calibration', cal);
const dev = (p) => toDevice(cal, p);
const results = [];
const check = (name, pass, detail = {}) => {
  results.push({ name, pass: !!pass, ...detail });
  log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail));
};

/** Colour statistics of the board canvas (CSS px): pixel count, centroid and bounding box near an rgb colour. */
const stats = (rgb, tol = 30) =>
  page.ev(`(() => {
    const c = document.querySelector('canvas'); const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data; const k = c.width / c.getBoundingClientRect().width;
    let n = 0, sx = 0, sy = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i]-${rgb[0]}) + Math.abs(d[i+1]-${rgb[1]}) + Math.abs(d[i+2]-${rgb[2]}) < ${tol}) {
        const p = i / 4, x = p % c.width, y = Math.floor(p / c.width);
        n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { n, x: n ? sx / n / k : 0, y: n ? sy / n / k : 0, box: [x0 / k, y0 / k, x1 / k, y1 / k] };
  })()`);
const KITE = [127, 166, 214];
const DART = [236, 188, 116];
const PENDING = [209, 73, 91];
const pendingPx = async () => (await stats(PENDING)).n;
const FINGER_LIFT = 72; // board.ts: the preview aims this far above the finger

// Pointer events seen by the page (to tell a real touch from a cancelled one).
await page.ev(`(window.__pe = [], ['pointerdown','pointerup','pointercancel'].forEach(t => addEventListener(t, e => window.__pe.push(t), true)), true)`);
const pointerLog = async () => {
  const l = await page.ev('window.__pe.splice(0)');
  return l.join(',');
};

// fresh free-mode game (setup only: the new-game button is clicked through CDP, Chrome's install
// banner can cover it)
await page.ev(`document.querySelector('.new-game').click(), true`);
await sleep(800);
const canvasRect = await rect(page, 'canvas');
const trayRect = await rect(page, '.tray');
const kiteBtn = centre(await rect(page, '.tray button'));
const freeBtn = await rect(page, '.mode button:first-child');
tap(dev(centre(freeBtn)));
await sleep(500);
await pointerLog();
log('new game: tiles', await page.ev(`document.querySelector('.hud strong').textContent`), 'pending px', await pendingPx());

const tilingBox = async () => {
  const bs = [await stats(KITE), await stats(DART)].filter((s) => s.n > 0).map((s) => s.box);
  return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
};

// 1. drag a kite out of the tray (real swipe); mid-drag the preview, aimed FINGER_LIFT above the finger,
//    snaps to a candidate; lifting the finger makes it the pending tile
let box = await tilingBox();
const aim = [box[2] - 6, (box[1] + box[3]) / 2];
const fingerAt = [aim[0], aim[1] + FINGER_LIFT];
const midDrag = await swipe(dev(kiteBtn), dev(fingerAt), 2500, async () => {
  const shot = screencap('06-1-dragging');
  return { shot, selected: await page.ev(`!!document.querySelector('.tray button.selected')`) };
});
await sleep(600);
screencap('06-2-dropped');
const p1 = await stats(PENDING);
check('drag from tray, preview snaps, release makes it the pending tile (real swipe)', p1.n > 50 && midDrag.selected, {
  selectedMidDrag: midDrag.selected,
  pendingPx: p1.n,
  events: await pointerLog(),
});

// 2. tap the pending tile: next legal orientation
const img1 = await page.ev(`document.querySelector('canvas').toDataURL()`);
tap(dev([p1.x, p1.y]));
await sleep(600);
const p2 = await stats(PENDING);
const img2 = await page.ev(`document.querySelector('canvas').toDataURL()`);
screencap('06-3-turned');
check('tap on the pending tile cycles its orientation (real tap)', p2.n > 50 && img1 !== img2, {
  centroidMoved: +Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(1),
  pendingPx: [p1.n, p2.n],
  canvasChanged: img1 !== img2,
});

// 3. drag the pending tile onto the tray (real swipe): the tray shows the drop target, lifting removes it
const trayC = centre(trayRect);
const removingShown = await swipe(dev([p2.x, p2.y]), dev(trayC), 2000, async () => {
  screencap('06-4-over-tray');
  return page.ev(`document.querySelector('.tray').classList.contains('removing')`);
});
await sleep(600);
const p3 = await pendingPx();
check('dragging the pending tile onto the tray removes it (real swipe)', removingShown && p3 === 0, { removingShown, pendingPx: p3 });

// 4. release with no candidate nearby (real swipe): nothing placed; aim at a board corner away from the tiling
box = await tilingBox();
const far = [box[0] > canvasRect.width - box[2] ? 24 : canvasRect.width - 24, Math.max(box[1] - 140, 200) + FINGER_LIFT];
await swipe(dev(kiteBtn), dev(far), 1500, async () => screencap('06-5-ghost'));
await sleep(600);
const p4 = await pendingPx();
check('release with no candidate nearby places nothing (real swipe)', p4 === 0, { at: far.map(Math.round), pendingPx: p4 });

// 5. carry a tile out over the tiling, back onto the tray, and release there. A straight swipe cannot
//    turn back, so this path uses CDP touch events; the real-swipe variant releases on the tray without
//    leaving it (kite button to dart button).
const dartBtn = centre(await rect(page, '.tray button:last-child'));
await swipe(dev(kiteBtn), dev(dartBtn), 800);
await sleep(500);
const p5a = await pendingPx();
await cdpTouch(page, [[...line(kiteBtn, fingerAt, 12), ...line(fingerAt, kiteBtn, 12)]]);
await sleep(600);
const p5b = await pendingPx();
check('release back on the tray places nothing', p5a === 0 && p5b === 0, { realSwipeWithinTray: p5a, cdpOutAndBack: p5b });

// 6. one-finger pan on empty board (real swipe)
const k0 = await stats(KITE);
const panFrom = [canvasRect.width / 2, Math.min(Math.max(box[3] + 40, canvasRect.height * 0.55), trayRect.y - 80)];
const panTo = [panFrom[0] - 80, panFrom[1] - 60];
await swipe(dev(panFrom), dev(panTo), 600);
await sleep(600);
const k1 = await stats(KITE);
const pan = [+(k1.x - k0.x).toFixed(1), +(k1.y - k0.y).toFixed(1)];
check('one-finger drag on empty board pans and places nothing (real swipe)', Math.abs(pan[0] + 80) < 20 && Math.abs(pan[1] + 60) < 20 && (await pendingPx()) === 0, {
  pan,
  events: await pointerLog(),
});

// 7. two-finger pinch (CDP: adb input has no multi-touch)
const mid = [canvasRect.width / 2, canvasRect.height / 2];
const pinch = async (from, to) => {
  await cdpTouch(page, [line([mid[0] - from, mid[1]], [mid[0] - to, mid[1]]), line([mid[0] + from, mid[1]], [mid[0] + to, mid[1]])]);
  await sleep(500);
};
// fit the whole tiling in view, then pinch in (fingers together) and out again; the tiling's width on screen
// should halve and double back
await page.ev(`document.querySelector('.zoom button:last-child').click(), true`);
await sleep(500);
const width = async () => { const b = await tilingBox(); return +(b[2] - b[0]).toFixed(1); };
const w0 = await width();
await pinch(120, 60);
const w1 = await width();
screencap('06-6-pinched-in');
await pinch(60, 120);
const w2 = await width();
check('two-finger pinch zooms and places nothing (CDP touch)', w1 < w0 * 0.7 && w2 > w1 * 1.4 && (await pendingPx()) === 0, { tilingWidth: [w0, w1, w2] });
// 8. flow mode (real taps and swipe): carry a tile out and lift anywhere on the board: placed at the spot
tap(dev(centre(await rect(page, '.mode button:last-child'))));
await sleep(800);
const somewhere = [canvasRect.width / 2, Math.min(canvasRect.height * 0.55, trayRect.y - 60)];
await swipe(dev(kiteBtn), dev(somewhere), 1500, async () => screencap('06-7-flow-dragging'));
await sleep(700);
const f1 = await pendingPx();
screencap('06-8-flow-placed');
check('flow mode: lifting a carried tile on the board places it (real swipe)', f1 > 50, { pendingPx: f1 });
tap(dev(centre(freeBtn)));
await sleep(500);

// ---- probes (real touches) ----
const hint = await rect(page, '.hint');
const hud = await rect(page, '.hud');
const dismissAt = dev([canvasRect.width - 14, Math.min(canvasRect.height * 0.75, trayRect.y - 40)]);
const press = async (p, name) => {
  longPress(dev(p), 1200);
  await sleep(600);
  screencap(`06-9-longpress-${name}`);
  const selection = await page.ev(`getSelection().toString()`);
  const ui = shell('uiautomator dump /sdcard/ptg-ui.xml >/dev/null && cat /sdcard/ptg-ui.xml; rm -f /sdcard/ptg-ui.xml');
  const menu = /(?:text|content-desc)="(Copy|複製|Select all|全選|Share|分享|Download image|下載圖片|Open in new tab|在新分頁中開啟)"/.exec(ui)?.[1] ?? null;
  tap(dismissAt); // clear a selection or close a menu, if any
  await sleep(500);
  await page.ev(`getSelection().removeAllRanges(), true`);
  if (!(await page.ev('location.href')).startsWith(APP_URL)) throw new Error('long press navigated away');
  return { selection, menu };
};
const lp = {
  hint: await press(centre(hint), 'hint'),
  hud: await press(centre(hud), 'hud'),
  menuButton: await press(centre(await rect(page, '.menu button')), 'menu-button'),
  tray: await press(kiteBtn, 'tray'),
  board: await press([canvasRect.width / 2, Math.min(canvasRect.height * 0.7, trayRect.y - 60)], 'board'),
};
check('long press shows no text selection or context menu', Object.values(lp).every((r) => !r.selection && !r.menu), lp);
await page.ev(`document.querySelector('.new-game').click(), true`); // undo whatever the probes changed
await sleep(600);

const doubleTap = async (p) => {
  const [x, y] = dev(p);
  shell(`input tap ${x} ${y} & sleep 0.12; input tap ${x} ${y}; wait`);
  await sleep(700);
  return page.ev('visualViewport.scale');
};
const dz = {
  board: await doubleTap([canvasRect.width / 2, Math.min(canvasRect.height * 0.7, trayRect.y - 60)]),
  hint: await doubleTap(centre(hint)),
  hud: await doubleTap(centre(hud)),
};
check('double tap does not zoom the page', Object.values(dz).every((s) => s === 1), dz);

await page.ev('window.__notReloaded = true');
const from = dev(centre(hud));
await swipe(from, [from[0], from[1] + 900], 400);
await sleep(1500);
const b0 = dev([canvasRect.width / 2, Math.max(hud.y + hud.height + 100, 200)]);
await swipe(b0, [b0[0], b0[1] + 900], 400);
await sleep(2500);
const notReloaded = await page.ev('window.__notReloaded === true').catch(() => false);
check('pull-to-refresh (swipe down from the top) does not reload the page', notReloaded);

// phone-width layout: no menu item covers the score HUD; the folded menu opens and closes with real taps
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const visibleItems = () => page.ev(`[...document.querySelectorAll('.menu > button')].filter(b => b.offsetParent).map(b => JSON.parse(JSON.stringify(b.getBoundingClientRect())))`);
const folded = await visibleItems();
tap(dev(centre(await rect(page, '.menu .toggle'))));
await sleep(500);
const opened = await visibleItems();
screencap('06-11-menu-open');
tap(dismissAt);
await sleep(500);
const refolded = await visibleItems();
check('menu does not cover the HUD; it unfolds and folds with real taps', [...folded, ...opened].every((r) => !overlaps(r, hud)) && folded.length === 1 && opened.length > 1 && refolded.length === 1, {
  visibleItems: [folded.length, opened.length, refolded.length],
});

screencap('06-10-end');log('exceptions', JSON.stringify(page.errors));
writeFileSync(join(OUT, '06-results.json'), JSON.stringify({ cal, results, errors: page.errors }, null, 2));
log(`screenshots and results in ${OUT}`);
page.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);

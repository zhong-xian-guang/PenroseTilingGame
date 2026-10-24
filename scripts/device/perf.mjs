// Ticket 15 on a real Android phone: runs bench.html (src/bench/main.ts: 5000 tiles, ~10 s pan, ~10 s zoom,
// 50 timed places) in the phone's Chrome and prints its results. Serve the bench build first, on its own port
// (BENCH_PORT, default 4174): on the app's port the installed app's service worker would answer /bench.html
// with the cached index.html.
//   npm run build:bench && npm run preview:bench -- --host 127.0.0.1 --port 4174
// usage: node scripts/device/perf.mjs [runs=1] [query, e.g. "tiles=5000&places=50"]
import { adb, checkBattery, log, openPage, OUT, screencap, setupForwards, shell, sleep } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const runs = Number(process.argv[2] ?? 1);
const query = process.argv[3] ?? '';
log('battery', checkBattery());
setupForwards();
const BENCH_PORT = Number(process.env.BENCH_PORT ?? 4174);
adb('reverse', `tcp:${BENCH_PORT}`, `tcp:${BENCH_PORT}`);
const url = `http://localhost:${BENCH_PORT}/bench.html${query ? `?${query}` : ''}`;
const page = await openPage(url);
// a service worker left by an older bench build would answer bench.html?… with index.html
await page.send('Storage.clearDataForOrigin', { origin: `http://localhost:${BENCH_PORT}`, storageTypes: 'all' });
const all = [];
for (let r = 0; r < runs; r++) {
  await page.send('Page.navigate', { url });
  await sleep(1000);
  const t0 = Date.now();
  let result = null;
  while (!result && Date.now() - t0 < 180_000) {
    await sleep(2000);
    result = await page.ev('window.__bench?.done ? window.__bench : null').catch(() => null);
  }
  if (!result) throw new Error('bench did not finish in 3 minutes');
  if (result.error) throw new Error(result.error);
  const temp = /temperature: (\d+)/.exec(shell('dumpsys battery'))?.[1];
  result.batteryTempC = temp ? Number(temp) / 10 : null;
  screencap(`15-bench-${r + 1}`);
  log(`run ${r + 1}:`, JSON.stringify(result));
  all.push(result);
}
writeFileSync(join(OUT, '15-results.json'), JSON.stringify(all, null, 2));
log(`results in ${OUT}`);
// leave nothing behind: the bench origin's service worker and storage, its tab, the port reverse
await page.send('Storage.clearDataForOrigin', { origin: `http://localhost:${BENCH_PORT}`, storageTypes: 'all' });
await page.send('Page.close').catch(() => {});
page.close();
adb('reverse', '--remove', `tcp:${BENCH_PORT}`);

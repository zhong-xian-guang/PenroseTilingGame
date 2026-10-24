/**
 * Large-tiling benchmark (ticket 15), served as /bench.html in dev and in `npm run build:bench`
 * builds only; the production build does not include it.
 *
 * It builds a 5000-tile patch of the Penrose tiling (the tiles nearest the centre of a deflated sun),
 * shows it on the real Board, then:
 *   1. pans for PAN_MS (half with the whole tiling in view, half zoomed in to a playing scale),
 *   2. zooms in and out for ZOOM_MS,
 *   3. places PLACES more tiles of the same tiling, one per frame, timing the engine.
 * Results go to `window.__bench` and the on-screen <pre>. It never touches the game's autosave,
 * IndexedDB or localStorage. Query parameters: tiles, places, pan, zoom (ms).
 */
import {
  createGame,
  DIRECTIONS,
  ORIGIN,
  P2,
  plus,
  pointKey,
  samePoint,
  scale,
  toXY,
  unit,
  zphi,
  type Placement,
  type Point,
  type ZPhi,
} from '../engine';
import { Board } from '../board/board';

const params = new URLSearchParams(location.search);
const TILES = Number(params.get('tiles') ?? 5000);
const PLACES = Number(params.get('places') ?? 50);
const PAN_MS = Number(params.get('pan') ?? 10_000);
const ZOOM_MS = Number(params.get('zoom') ?? 10_000);

const status = document.getElementById('status')!;
const show = (text: string) => (status.textContent = text);

// ---- the reference tiling: exact Robinson-half deflation of a sun (public engine API only) ----

const Z1 = zphi(1);
const ZPHI = zphi(0, 1);
const PSI = zphi(-1, 1); // 1/φ
const PSI2 = zphi(2, -1); // 1/φ²
const mul = (x: ZPhi, y: ZPhi): ZPhi => zphi(x.a * y.a + x.b * y.b, x.a * y.b + x.b * y.a + x.b * y.b);
const minus = (p: Point, q: Point): Point => plus(p, scale(zphi(-1), q));
const along = (a: Point, b: Point, t: ZPhi): Point => plus(a, scale(t, minus(b, a)));

interface Half {
  kind: 'kite' | 'dart';
  apex: Point;
  outer: Point;
  axisEnd: Point;
}

function deflate(h: Half): Half[] {
  if (h.kind === 'kite') {
    const p = along(h.apex, h.axisEnd, PSI);
    const q = along(h.apex, h.outer, PSI2);
    return [
      { kind: 'kite', apex: h.outer, outer: h.axisEnd, axisEnd: p },
      { kind: 'kite', apex: h.outer, outer: q, axisEnd: p },
      { kind: 'dart', apex: h.apex, outer: p, axisEnd: q },
    ];
  }
  const r = along(h.apex, h.outer, PSI);
  return [
    { kind: 'kite', apex: h.apex, outer: r, axisEnd: h.axisEnd },
    { kind: 'dart', apex: h.outer, outer: h.axisEnd, axisEnd: r },
  ];
}

const AXIS = { kite: ZPHI, dart: Z1 };
function directionOf(v: Point, length: ZPhi): number {
  for (let k = 0; k < DIRECTIONS; k++) if (samePoint(v, scale(length, unit(k)))) return k;
  throw new Error('no direction');
}

/** Whole tiles of an n-times deflated sun, nearest the centre first. */
function reference(n: number): Placement[] {
  let size = Z1;
  for (let i = 0; i <= n; i++) size = mul(size, ZPHI);
  let halves: Half[] = [];
  for (let d = 0; d < DIRECTIONS; d += 2)
    for (const s of [-1, 1])
      halves.push({ kind: 'kite', apex: ORIGIN, outer: scale(size, unit(d + s)), axisEnd: scale(size, unit(d)) });
  for (let i = 0; i < n; i++) halves = halves.flatMap(deflate);
  const groups = new Map<string, Half[]>();
  for (const h of halves) {
    const key = `${h.kind}|${pointKey(h.apex)}|${pointKey(h.axisEnd)}`;
    const g = groups.get(key);
    if (g) g.push(h);
    else groups.set(key, [h]);
  }
  const shapes = createGame({ opening: [] });
  const out: { p: Placement; d: number }[] = [];
  for (const g of groups.values()) {
    if (g.length !== 2) continue;
    const h = g[0]!;
    const p: Placement = { kind: h.kind, origin: h.apex, dir: directionOf(minus(h.axisEnd, h.apex), AXIS[h.kind]) };
    const vs = shapes.verticesOf(p).map(toXY);
    const cx = vs.reduce((s, v) => s + v.x, 0) / vs.length;
    const cy = vs.reduce((s, v) => s + v.y, 0) / vs.length;
    out.push({ p, d: Math.hypot(cx, cy) });
  }
  return out.sort((a, b) => a.d - b.d).map((r) => r.p);
}

// ---- measuring ----

interface FrameStats {
  frames: number;
  fps: number;
  median: number;
  p95: number;
  max: number;
}

const round = (x: number) => Math.round(x * 100) / 100;
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;

function frameStats(intervals: number[]): FrameStats {
  const f = intervals.slice(2).sort((a, b) => a - b); // the first frames of a phase include its setup
  const mean = f.reduce((s, x) => s + x, 0) / f.length;
  return { frames: f.length, fps: round(1000 / mean), median: round(quantile(f, 0.5)), p95: round(quantile(f, 0.95)), max: round(f[f.length - 1]!) };
}

/** Calls `step(elapsed ms)` once per animation frame for `ms`, returning the frame intervals. */
function animate(ms: number, step: (t: number) => void): Promise<number[]> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    let start = -1;
    let last = 0;
    const tick = (now: number) => {
      if (start < 0) start = now;
      else intervals.push(now - last);
      last = now;
      if (now - start >= ms) return resolve(intervals);
      step(now - start);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  show(`building ${TILES} tiles…`);
  await nextFrame();
  let t0 = performance.now();
  const ref = reference(8);
  const buildMs = performance.now() - t0;
  if (ref.length < TILES + PLACES * 4) throw new Error(`reference has only ${ref.length} tiles`);

  t0 = performance.now();
  const game = createGame({ tileSet: P2, opening: ref.slice(0, TILES) });
  const queries = () => {
    game.candidates('kite');
    game.candidates('dart');
    game.deadEnds();
    game.growthCircle();
    game.confirmedTiles();
    game.score();
  };
  queries();
  const createMs = performance.now() - t0;

  const canvas = document.getElementById('board') as HTMLCanvasElement;
  const board = new Board(canvas, game);
  const cam = board.camera;
  const fitScale = cam.scale;
  show('settling…');
  await wait(1500);

  // 1. pan: a Lissajous path, first with the whole tiling in view, then at a playing scale
  show('panning (whole tiling)…');
  const radius = Math.min(cam.width, cam.height) * 0.3;
  const panPath = (t: number) => ({ x: radius * Math.sin(t / 700), y: radius * Math.cos(t / 1100) });
  const panOnce = async (ms: number) => {
    let prev = panPath(0);
    return animate(ms, (t) => {
      const p = panPath(t);
      cam.panBy(p.x - prev.x, p.y - prev.y);
      prev = p;
      board.requestDraw();
    });
  };
  const panFit = frameStats(await panOnce(PAN_MS / 2));
  board.zoomBy(60 / cam.scale); // the scale a new game opens at (~60 CSS px per edge)
  await wait(800);
  show('panning (zoomed in)…');
  const panZoomed = frameStats(await panOnce(PAN_MS / 2));

  // 2. zoom: the scale swings between the whole tiling and ~4× it, about the centre
  board.fitToTiling();
  await wait(800);
  show('zooming…');
  let logScale = Math.log(cam.scale);
  const zoom = frameStats(
    await animate(ZOOM_MS, (t) => {
      const target = Math.log(fitScale) + Math.log(4) * (0.5 - 0.5 * Math.cos(t / 800));
      board.zoomBy(Math.exp(target - logScale));
      logScale = Math.log(cam.scale);
    }),
  );

  // 3. place: one tile of the reference tiling per frame (always a legal continuation)
  board.zoomBy(60 / cam.scale);
  await wait(800);
  show('placing…');
  const rest = ref.slice(TILES);
  const key = (p: Placement) => `${p.kind}@${pointKey(p.origin)}/${p.dir}`;
  const placeOnly: number[] = [];
  const placeAll: number[] = [];
  const placeFrames: number[] = [];
  let last = await nextFrame() as number;
  for (let i = 0; i < PLACES; i++) {
    const open = new Set([...game.candidates('kite'), ...game.candidates('dart')].map(key));
    const idx = rest.findIndex((p) => open.has(key(p)));
    if (idx < 0) break;
    const [next] = rest.splice(idx, 1);
    t0 = performance.now();
    if (!game.place(next!)) throw new Error('place failed');
    const t1 = performance.now();
    queries();
    placeOnly.push(t1 - t0);
    placeAll.push(performance.now() - t0);
    const now = (await nextFrame()) as number;
    placeFrames.push(now - last);
    last = now;
    if (game.status() === 'over') break;
  }
  const ms = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return { n: s.length, median: round(quantile(s, 0.5)), p90: round(quantile(s, 0.9)), max: round(s[s.length - 1]!) };
  };

  const result = {
    done: true,
    userAgent: navigator.userAgent,
    viewport: { width: cam.width, height: cam.height, dpr: devicePixelRatio },
    tiles: TILES,
    buildMs: round(buildMs),
    createMs: round(createMs),
    panFit,
    panZoomed,
    zoom,
    place: ms(placeOnly),
    placeWithQueries: ms(placeAll),
    placeFrames: frameStats([0, 0, ...placeFrames]),
    status: game.status(),
    tilesAfter: game.score().tiles,
  };
  (window as unknown as { __bench: unknown }).__bench = result;
  show(JSON.stringify(result, null, 1));
}

run().catch((e: unknown) => {
  (window as unknown as { __bench: unknown }).__bench = { done: true, error: String(e) };
  show(`error: ${String(e)}`);
});

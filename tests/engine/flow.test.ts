import { describe, expect, it } from 'vitest';
import {
  createGame,
  decodeRecord,
  encodeRecord,
  replayRecord,
  FLOW_NEAR_RADIUS,
  openingPatch,
  P2,
  pointKey,
  toXY,
  type Game,
  type Placement,
  type Point,
} from '../../src/engine';

const allCandidates = (game: Game) => [...game.candidates('kite'), ...game.candidates('dart')];
const centreOf = (pts: readonly Point[]) => {
  const xy = pts.map(toXY);
  return { x: xy.reduce((s, p) => s + p.x, 0) / xy.length, y: xy.reduce((s, p) => s + p.y, 0) / xy.length };
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The flow-mode rule, worked out independently from the spec: the open spots
 * are the boundary points inside the growth circle that some candidate
 * placement has a corner on; concave ones (corners filling more than half a
 * turn) are preferred whenever there are any. Among the spots within
 * FLOW_NEAR_RADIUS of the last tile's centre, the one with the fewest
 * candidates wins (nearer breaks ties); with none near, the nearest one.
 * Returns the winning (options, distance) pair, or null when nothing is open.
 */
function expectedSpot(game: Game): { options: number; d: number } | null {
  const tiles = game.tiles();
  const ref = centreOf(tiles[tiles.length - 1]!.vertices);
  const circle = game.growthCircle();
  const candidates = allCandidates(game).map((c) => new Set(game.verticesOf(c).map(pointKey)));
  const points = new Map<string, Point>();
  for (const t of tiles) for (const v of t.vertices) points.set(pointKey(v), v);
  const open: { options: number; d: number; concave: boolean }[] = [];
  for (const [key, p] of points) {
    const info = game.vertexAt(p)!;
    if (info.complete) continue;
    if (dist(toXY(p), circle.center) > circle.radius) continue;
    const options = candidates.filter((c) => c.has(key)).length;
    if (options === 0) continue;
    const filled = info.corners.reduce((s, c) => s + P2.shapes[c.kind]!.corners[c.corner]!.angle, 0);
    open.push({ options, d: dist(toXY(p), ref), concave: filled > 5 });
  }
  const concave = open.filter((s) => s.concave);
  const pool = concave.length > 0 ? concave : open;
  if (pool.length === 0) return null;
  const near = pool.filter((s) => s.d <= FLOW_NEAR_RADIUS);
  const ranked = near.length > 0 ? near.sort((a, b) => a.options - b.options || a.d - b.d) : pool.sort((a, b) => a.d - b.d);
  return ranked[0]!;
}

/** A deterministic little pseudo-random walk: place candidates that leave no dead end. */
function* walk(seed: number, steps: number): Generator<Game> {
  const game = createGame({ opening: openingPatch(seed) });
  let r = seed;
  const next = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  yield game;
  for (let i = 0; i < steps && game.status() === 'playing'; i++) {
    const cs = allCandidates(game);
    const start = Math.floor(next() * cs.length);
    let placed = false;
    for (let k = 0; k < cs.length && !placed; k++) {
      const c: Placement = cs[(start + k) % cs.length]!;
      game.place(c);
      if (game.status() === 'over') return;
      if (game.deadEnds().length === 0) placed = true;
      else game.removePending();
    }
    if (!placed) return;
    yield game;
  }
}

describe('flow mode recommendation', () => {
  it('picks, near the last tile, the open concave spot with the fewest candidates, else the nearest one', () => {
    let near = 0;
    let checked = 0;
    for (const seed of [1, 2, 3, 5, 8, 13]) {
      for (const game of walk(seed, 14)) {
        const want = expectedSpot(game);
        const got = game.flowSpot();
        if (want === null) {
          expect(got).toBeNull();
          continue;
        }
        expect(got).not.toBeNull();
        const tiles = game.tiles();
        const d = dist(toXY(got!.position), centreOf(tiles[tiles.length - 1]!.vertices));
        const options = allCandidates(game).filter((c) =>
          game.verticesOf(c).some((v) => pointKey(v) === pointKey(got!.position)),
        ).length;
        expect(got!.options).toBe(options);
        expect(options).toBe(want.options);
        expect(d).toBeCloseTo(want.d, 9);
        if (want.d <= FLOW_NEAR_RADIUS) near++;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(near).toBeGreaterThan(0);
  });

  it('always recommends a point inside the growth circle', () => {
    for (const seed of [4, 6, 9]) {
      for (const game of walk(seed, 14)) {
        const spot = game.flowSpot();
        if (!spot) continue;
        const { center, radius } = game.growthCircle();
        expect(dist(toXY(spot.position), center)).toBeLessThanOrEqual(radius);
      }
    }
  });

  it('recommends nothing once the game is over', () => {
    const game = createGame({ growthMargin: 0 });
    while (game.status() === 'playing') {
      const c = allCandidates(game)[0];
      if (!c) break;
      game.place(c);
    }
    expect(game.status()).toBe('over');
    expect(game.flowSpot()).toBeNull();
  });
});

describe('switching between free and flow mode', () => {
  const snapshot = (game: Game) => ({
    tiles: game.tiles().map((t) => `${t.kind}@${pointKey(t.origin)}/${t.dir}`),
    pending: game.pendingTile()?.id ?? null,
    kites: game.candidates('kite').length,
    darts: game.candidates('dart').length,
    status: game.status(),
    score: game.score(),
  });

  it('starts in free mode (or the mode it was created with) and switching changes nothing on the board', () => {
    expect(createGame().mode()).toBe('free');
    expect(createGame({ mode: 'flow' }).mode()).toBe('flow');
    const game = createGame({ opening: openingPatch(3) });
    game.place(allCandidates(game)[0]!);
    const before = snapshot(game);
    const events: string[] = [];
    game.subscribe((e) => events.push(e.type));
    game.setMode('flow');
    expect(game.mode()).toBe('flow');
    expect(snapshot(game)).toEqual(before);
    game.setMode('flow');
    expect(events).toEqual(['mode-changed']);
    game.setMode('free');
    expect(game.mode()).toBe('free');
    expect(snapshot(game)).toEqual(before);
  });

  it('records the mode of every placement, through encoding and replay', () => {
    const game = createGame({ opening: openingPatch(11) });
    game.place(allCandidates(game)[0]!);
    game.setMode('flow');
    game.place(allCandidates(game)[0]!);
    game.turnPending();
    game.setMode('free');
    game.place(allCandidates(game)[0]!);
    const modes = (steps: readonly { type: string; mode?: string }[]) =>
      steps.filter((s) => s.type === 'place').map((s) => s.mode);
    expect(modes(game.record().steps)).toEqual(['free', 'flow', 'free']);

    const back = decodeRecord(encodeRecord(game.record()));
    expect(modes(back.steps)).toEqual(['free', 'flow', 'free']);
    const replayed = replayRecord(back);
    expect(replayed.record()).toEqual(game.record());
    expect(snapshot(replayed)).toEqual(snapshot(game));
  });

  it('a record without modes (older games) decodes and replays as free play', () => {
    const game = createGame({ opening: openingPatch(12) });
    game.place(allCandidates(game)[0]!);
    const old = JSON.parse(encodeRecord(game.record()));
    for (const s of old.steps) delete s.mode;
    const replayed = replayRecord(decodeRecord(JSON.stringify(old)));
    expect(snapshot(replayed)).toEqual(snapshot(game));
    expect(replayed.mode()).toBe('free');
  });
});

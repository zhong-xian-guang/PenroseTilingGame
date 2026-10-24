import { describe, expect, it } from 'vitest';
import {
  analyzeRecord,
  createGame,
  openingPatch,
  ORIGIN,
  P2,
  replayFrames,
  toXY,
  zphi,
  type GameRecord,
  type Placement,
} from '../../src/engine';
import { keyOf } from './helpers';


/** P2 areas with short edge 1 (literature): kite = φ² sin 36°, dart = sin 72°. */
const KITE_AREA = 1.5388417685876268;
const DART_AREA = 0.9510565162951535;

describe('analyzeRecord: usage statistics', () => {
  it('counts the tiles of each kind and the area of the final confirmed tiling', () => {
    const record: GameRecord = {
      tileSet: P2.id,
      opening: [
        { kind: 'kite', origin: ORIGIN, dir: 0 },
        { kind: 'kite', origin: ORIGIN, dir: 2 },
        { kind: 'kite', origin: ORIGIN, dir: 4 },
      ],
      steps: [],
    };
    const stats = analyzeRecord(record);
    expect(stats.tiles).toBe(3);
    expect(stats.kites).toBe(3);
    expect(stats.darts).toBe(0);
    expect(stats.area).toBeCloseTo(3 * KITE_AREA, 12);
  });

  it('gives the kite-to-dart ratio, null while there is no dart', () => {
    const noDart = analyzeRecord({ tileSet: P2.id, opening: [{ kind: 'kite', origin: ORIGIN, dir: 0 }], steps: [] });
    expect(noDart.kiteDartRatio).toBeNull();
    // a larger opening patch has both kinds; the ratio is simply kites / darts
    const seed = [...Array(50).keys()].find((s) => openingPatch(s).some((p) => p.kind === 'dart'))!;
    const stats = analyzeRecord(createGame({ tileSet: P2, opening: openingPatch(seed) }).record());
    expect(stats.darts).toBeGreaterThan(0);
    expect(stats.kiteDartRatio).toBeCloseTo(stats.kites / stats.darts, 12);
    expect(stats.area).toBeCloseTo(stats.kites * KITE_AREA + stats.darts * DART_AREA, 12);
  });
});

// ---- independent float oracle for the shape measures ----
type XY = { x: number; y: number };
const polygonsOf = (record: GameRecord): XY[][] =>
  record.opening.map((p) => createGame({ opening: [] }).verticesOf(p).map(toXY));
const polyArea = (q: XY[]) => q.reduce((s, a, i) => s + (a.x * q[(i + 1) % q.length]!.y - q[(i + 1) % q.length]!.x * a.y), 0) / 2;
function centroidOf(polys: XY[][]): XY {
  let ax = 0, ay = 0, at = 0;
  for (const q of polys) {
    const a = polyArea(q);
    let cx = 0, cy = 0;
    q.forEach((p, i) => {
      const n = q[(i + 1) % q.length]!;
      const w = p.x * n.y - n.x * p.y;
      cx += (p.x + n.x) * w;
      cy += (p.y + n.y) * w;
    });
    ax += cx / 6;
    ay += cy / 6;
    at += a;
  }
  return { x: ax / at, y: ay / at };
}
const segDist = (p: XY, a: XY, b: XY) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const inside = (p: XY, q: XY[]) => {
  let c = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i]!, b = q[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
/** Fraction of the disc (centre c, radius r) covered by the polygons, by sampling a fine grid. */
function coveredFraction(polys: XY[][], c: XY, r: number): number {
  const n = 400;
  let hit = 0, all = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const p = { x: c.x - r + ((i + 0.5) * 2 * r) / n, y: c.y - r + ((j + 0.5) * 2 * r) / n };
      if (Math.hypot(p.x - c.x, p.y - c.y) > r) continue;
      all++;
      if (polys.some((q) => inside(p, q))) hit++;
    }
  return hit / all;
}

const sun: GameRecord = {
  tileSet: P2.id,
  opening: [0, 2, 4, 6, 8].map((dir) => ({ kind: 'kite' as const, origin: ORIGIN, dir })),
  steps: [],
};
const oneKite: GameRecord = { tileSet: P2.id, opening: [{ kind: 'kite', origin: ORIGIN, dir: 0 }], steps: [] };

describe('analyzeRecord: shape completeness', () => {
  it('complete radius: the largest disc around the centroid covered by tiles, out to the nearest boundary edge', () => {
    // the sun is symmetric about the origin, which is its centroid; its boundary is the ten outer edges
    const s = analyzeRecord(sun);
    expect(s.centroid.x).toBeCloseTo(0, 12);
    expect(s.centroid.y).toBeCloseTo(0, 12);
    const outer = polygonsOf(sun).flatMap((q) => [segDist({ x: 0, y: 0 }, q[1]!, q[2]!), segDist({ x: 0, y: 0 }, q[2]!, q[3]!)]);
    expect(s.completeRadius).toBeCloseTo(Math.min(...outer), 10);

    // a single kite: its centroid, out to the nearest of its four edges
    const k = analyzeRecord(oneKite);
    const [q] = polygonsOf(oneKite);
    const c = centroidOf([q!]);
    expect(k.centroid.x).toBeCloseTo(c.x, 10);
    expect(k.centroid.y).toBeCloseTo(c.y, 10);
    expect(k.completeRadius).toBeCloseTo(Math.min(...q!.map((a, i) => segDist(c, a, q![(i + 1) % 4]!))), 10);
  });

  it('roundness: the share of the equal-area disc around the centroid that the tiling covers', () => {
    for (const record of [sun, oneKite]) {
      const s = analyzeRecord(record);
      const polys = polygonsOf(record);
      expect(s.equalAreaRadius).toBeCloseTo(Math.sqrt(s.area / Math.PI), 12);
      expect(s.roundness).toBeGreaterThan(0);
      expect(s.roundness).toBeLessThanOrEqual(1);
      expect(s.roundness).toBeCloseTo(coveredFraction(polys, centroidOf(polys), s.equalAreaRadius), 2);
    }
    // the sun is far rounder than a lone kite
    expect(analyzeRecord(sun).roundness).toBeGreaterThan(analyzeRecord(oneKite).roundness);
  });
});

/** The three-tile dead end of dead-end.test.ts: second kite, then a dart leaving an unfillable pocket. */
const secondKite: Placement = { kind: 'kite', origin: { u: zphi(1, 2), v: zphi(0, -1) }, dir: 4 };
const fatalDart: Placement = { kind: 'dart', origin: { u: zphi(0, 0), v: zphi(0, 1) }, dir: 5 };
/** A game that ends: kite, fatal dart, then one more tile (which confirms the dart and ends the game). */
const finishedGame = () => {
  const game = createGame();
  game.place(secondKite);
  game.place(fatalDart);
  game.place([...game.candidates('kite'), ...game.candidates('dart')][0]!);
  expect(game.status()).toBe('over');
  return game;
};

describe('analyzeRecord: what counts', () => {
  it('counts only the confirmed tiling: not the pending tile, not the game-ending tile', () => {
    const playing = createGame();
    playing.place(secondKite);
    expect(analyzeRecord(playing.record()).tiles).toBe(1);

    const s = analyzeRecord(finishedGame().record());
    expect(s.tiles).toBe(3);
    expect(s.kites).toBe(2);
    expect(s.darts).toBe(1);
    expect(s.area).toBeCloseTo(2 * KITE_AREA + DART_AREA, 12);
  });

  it('splits the confirmed placed tiles into free and flow mode; steps without a mode were played free', () => {
    // three places, the last one ends the game and is not scored
    const record = finishedGame().record();
    expect(analyzeRecord(record).modes).toEqual({ free: 2, flow: 0 });
    const flowed: GameRecord = {
      ...record,
      steps: record.steps.map((s, i) => (s.type === 'place' && i > 0 ? { ...s, mode: 'flow' as const } : s)),
    };
    expect(analyzeRecord(flowed).modes).toEqual({ free: 1, flow: 1 });
  });

  it('does not count removed tiles or the pending tile in the mode split', () => {
    const game = createGame();
    const all = () => [...game.candidates('kite'), ...game.candidates('dart')];
    game.place(all()[0]!); // free, then removed
    game.removePending();
    game.setMode('flow');
    game.place(all()[0]!); // flow, confirmed by the next one
    game.place(all()[0]!); // flow, confirmed by the next one
    game.setMode('free');
    game.place(all()[0]!); // free, still pending
    expect(game.status()).toBe('playing');
    expect(game.score().tiles).toBe(3);
    expect(analyzeRecord(game.record()).modes).toEqual({ free: 0, flow: 2 });
  });
});

describe('replayFrames', () => {
  it('gives the position before any step and after each step, ending where the game ended', () => {
    const game = createGame();
    game.place(secondKite);
    game.turnPending();
    game.removePending();
    game.place(secondKite);
    game.place(fatalDart);
    game.place([...game.candidates('kite'), ...game.candidates('dart')][0]!);
    const record = game.record();
    const frames = replayFrames(record);
    expect(frames).toHaveLength(record.steps.length + 1);

    // frame 0: the opening only
    expect(frames[0]!.confirmedTiles().map(keyOf)).toEqual(record.opening.map(keyOf));
    expect(frames[0]!.pendingTile()).toBeNull();
    // the second kite pending, then removed again
    expect(keyOf(frames[1]!.pendingTile()!)).toBe(keyOf(secondKite));
    const removed = record.steps.findIndex((s) => s.type === 'remove') + 1;
    expect(frames[removed]!.pendingTile()).toBeNull();
    expect(frames[removed]!.confirmedTiles()).toHaveLength(1);
    // the dart pending: its pocket is marked but not yet fatal
    const dart = frames.at(-2)!;
    expect(keyOf(dart.pendingTile()!)).toBe(keyOf(fatalDart));
    expect(dart.deadEnds().length).toBeGreaterThan(0);
    expect(dart.deadEnds().every((d) => d.cause === 'pending')).toBe(true);
    // last frame: the final position, game over
    const last = frames.at(-1)!;
    expect(last.status()).toBe('over');
    expect(last.pendingTile()).toBeNull();
    expect(last.confirmedTiles().map(keyOf)).toEqual(game.confirmedTiles().map(keyOf));
    expect(last.deadEnds().length).toBeGreaterThan(0);
    expect(last.deadEnds().every((d) => d.cause === 'confirmed')).toBe(true);
    expect(last.score()).toEqual(game.score());
  });
});

import { describe, expect, it } from 'vitest';
import {
  createGame,
  GROWTH_MARGIN,
  openingPatch,
  ORIGIN,
  pointKey,
  toXY,
  type Game,
  type Placement,
  type Point,
  zphi,
} from '../../src/engine';

/** Area-weighted centroid of the confirmed tiling (shoelace), computed independently of the engine. */
function confirmedCentroid(game: Game) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (const t of game.confirmedTiles()) {
    const p = t.vertices.map(toXY);
    for (let i = 0; i < p.length; i++) {
      const q = p[i]!;
      const r = p[(i + 1) % p.length]!;
      const c = q.x * r.y - r.x * q.y;
      a += c / 2;
      cx += ((q.x + r.x) * c) / 6;
      cy += ((q.y + r.y) * c) / 6;
    }
  }
  return { x: cx / a, y: cy / a };
}

const keyOf = (p: Placement) => `${p.kind}@${pointKey(p.origin)}/${((p.dir % 10) + 10) % 10}`;
const allCandidates = (game: Game) => [...game.candidates('kite'), ...game.candidates('dart')];
const centreOf = (pts: readonly Point[]) => {
  const xy = pts.map(toXY);
  return { x: xy.reduce((s, p) => s + p.x, 0) / xy.length, y: xy.reduce((s, p) => s + p.y, 0) / xy.length };
};
const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Grows a long arm of tiles towards `dir` (a unit vector) with no growth
 * circle at all (infinite margin), always taking the candidate whose centre
 * lies farthest along `dir` that leaves no dead end. Returns the confirmed tiles.
 */
function growArm(opening: readonly Placement[], steps: number, dir: { x: number; y: number }): Placement[] {
  const game = createGame({ opening, growthMargin: Infinity });
  for (let i = 0; i < steps; i++) {
    const along = (p: Placement) => {
      const c = centreOf(game.verticesOf(p));
      return c.x * dir.x + c.y * dir.y;
    };
    const ranked = [...allCandidates(game)].sort((a, b) => along(b) - along(a));
    const ok = ranked.some((c) => {
      expect(game.place(c)).toBe(true);
      if (game.deadEnds().length === 0) return true;
      game.removePending();
      return false;
    });
    expect(ok).toBe(true);
  }
  return game.tiles().map(({ kind, origin, dir: d }) => ({ kind, origin, dir: d }));
}

describe('growth circle', () => {
  it('has radius sqrt(area / pi) + margin and is centred on the confirmed tiling', () => {
    const game = createGame({ opening: openingPatch(7) });
    const circle = game.growthCircle();
    expect(GROWTH_MARGIN).toBeGreaterThan(0);
    expect(circle.radius).toBeCloseTo(Math.sqrt(game.score().area / Math.PI) + GROWTH_MARGIN, 12);
    const c = confirmedCentroid(game);
    expect(circle.center.x).toBeCloseTo(c.x, 9);
    expect(circle.center.y).toBeCloseTo(c.y, 9);
  });

  it('grows when the confirmed area grows; the pending tile does not move it', () => {
    const game = createGame();
    const before = game.growthCircle();
    game.place(allCandidates(game)[0]!);
    expect(game.growthCircle()).toEqual(before);
    game.place(allCandidates(game)[0]!);
    const after = game.growthCircle();
    expect(game.score().tiles).toBe(2);
    expect(after.radius).toBeGreaterThan(before.radius);
  });

  it('places outside the circle are not candidates and cannot be placed', () => {
    const opening = growArm([{ kind: 'kite', origin: ORIGIN, dir: 0 }], 30, { x: 1, y: 0 });
    const free = createGame({ opening, growthMargin: Infinity });
    const game = createGame({ opening });
    const { center, radius } = game.growthCircle();
    const dist = (p: Placement) => {
      const c = centreOf(game.verticesOf(p));
      return Math.hypot(c.x - center.x, c.y - center.y);
    };
    const all = allCandidates(free);
    const inCircle = allCandidates(game);
    const inKeys = new Set(inCircle.map(keyOf));
    const outside = all.filter((p) => !inKeys.has(keyOf(p)));

    expect(inCircle.length).toBeGreaterThan(0);
    expect(outside.length).toBeGreaterThan(0);
    // every restricted candidate is an ordinary candidate, glued on near the circle
    const allKeys = new Set(all.map(keyOf));
    for (const p of inCircle) {
      expect(allKeys.has(keyOf(p))).toBe(true);
      expect(dist(p)).toBeLessThanOrEqual(radius + PHI);
    }
    // the far end of the arm is out of reach
    const farthest = outside.reduce((a, b) => (dist(b) > dist(a) ? b : a));
    expect(dist(farthest)).toBeGreaterThan(radius + PHI);
    for (const p of outside) expect(dist(p)).toBeGreaterThan(radius - PHI);
    expect(game.place(farthest)).toBe(false);
    expect(game.tiles().length).toBe(opening.length);
  });

  it('dead ends outside the circle are not dead ends (yet); inside they are', () => {
    // the three-tile pocket of the dead-end tests, on the opening kite's edge 2
    const kite0: Placement = { kind: 'kite', origin: ORIGIN, dir: 0 };
    const secondKite: Placement = { kind: 'kite', origin: { u: zphi(1, 2), v: zphi(0, -1) }, dir: 4 };
    const fatalDart: Placement = { kind: 'dart', origin: { u: zphi(0, 0), v: zphi(0, 1) }, dir: 5 };
    const near = createGame({ opening: [kite0, secondKite, fatalDart] });
    expect(near.deadEnds().length).toBeGreaterThan(0);
    const pocket = near.deadEnds()[0]!;
    const m = centreOf([pocket.from, pocket.to]);
    const away = { x: -m.x / Math.hypot(m.x, m.y), y: -m.y / Math.hypot(m.x, m.y) };

    // grow a long arm away from the pocket first, then close the pocket
    const arm = growArm([kite0, secondKite], 40, away);
    const opening = [...arm, fatalDart];
    const free = createGame({ opening, growthMargin: Infinity });
    const freeDead = free.deadEnds().map((d) => [d.from, d.to].map(pointKey).sort().join('|'));
    expect(freeDead).toContain([pocket.from, pocket.to].map(pointKey).sort().join('|'));

    const game = createGame({ opening });
    const { center, radius } = game.growthCircle();
    expect(Math.hypot(m.x - center.x, m.y - center.y)).toBeGreaterThan(radius + 1);
    expect(game.deadEnds()).toEqual([]);
    // so the game goes on: a tile inside the circle is placed and stays
    expect(game.place(allCandidates(game)[0]!)).toBe(true);
    expect(game.place(allCandidates(game)[0]!)).toBe(true);
    expect(game.status()).toBe('playing');
    expect(game.tiles().length).toBe(opening.length + 2);
  });

  it('with no candidate placement anywhere inside the circle the game is over', () => {
    const game = createGame({ opening: openingPatch(7), growthMargin: -100 });
    expect(allCandidates(game)).toEqual([]);
    expect(game.status()).toBe('over');
  });
});

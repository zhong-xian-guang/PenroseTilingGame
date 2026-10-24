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
import { allCandidates, asOpening, keyOf, rng } from './helpers';

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

  it('a pending tile that leaves no candidate inside the circle is marked; the game goes on until it is confirmed', () => {
    // a deliberately tiny circle (negative margin), so one tile can close off everything inside it
    const margin = -0.4;
    let found: { opening: Placement[]; tile: Placement } | null = null;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const opening = openingPatch(seed);
      const probe = createGame({ opening, growthMargin: margin });
      for (const tile of allCandidates(probe)) {
        const game = createGame({ opening, growthMargin: margin });
        game.place(tile);
        if (allCandidates(game).length === 0 && game.deadEnds().length > 0) {
          found = { opening, tile };
          break;
        }
      }
    }
    expect(found).not.toBeNull();
    const { opening, tile } = found!;
    const game = createGame({ opening, growthMargin: margin });
    expect(game.place(tile)).toBe(true);
    expect(allCandidates(game)).toEqual([]);
    expect(game.status()).toBe('playing');
    expect(game.pendingTile()).not.toBeNull();
    expect(game.deadEnds().every((d) => d.cause === 'pending')).toBe(true);
    // the player can still take it back
    expect(game.removePending()).toBe(true);
    expect(allCandidates(game).length).toBeGreaterThan(0);
    expect(game.deadEnds()).toEqual([]);
  });

  it('a dead end the confirmed tiling only shows once the circle grows ends the game when the next tile is placed', () => {
    const deadKeys = (g: Game) => g.deadEnds().map((d) => [d.from, d.to].map(pointKey).sort().join('|')).sort();
    let checked = false;
    for (let seed = 1; seed <= 60 && !checked; seed++) {
      const random = rng(seed);
      const game = createGame({ opening: openingPatch(seed) });
      for (let step = 0; step < 80 && game.status() === 'playing' && !checked; step++) {
        if (game.deadEnds().length > 0) {
          game.removePending();
          continue;
        }
        const all = allCandidates(game);
        if (all.length === 0) break;
        const next = all[Math.floor(random() * all.length)]!;
        // the confirmed tiling once the pending tile is confirmed (and the circle has grown to it)
        const witness = game.pendingTile() ? createGame({ opening: asOpening(game.tiles()) }) : null;
        if (!witness || witness.deadEnds().length === 0) {
          expect(game.place(next)).toBe(true);
          expect(game.status() === 'over' || game.deadEnds().every((d) => d.cause === 'pending')).toBe(true);
          continue;
        }
        const before = game.tiles().length;
        expect(game.place(next)).toBe(true);
        expect(game.status()).toBe('over');
        expect(game.deadEnds().every((d) => d.cause === 'confirmed')).toBe(true);
        expect(deadKeys(game)).toEqual(deadKeys(witness));
        // the pending tile was confirmed and scores; the new one was not added
        expect(game.tiles().length).toBe(before);
        expect(game.score().tiles).toBe(before);
        expect(game.pendingTile()).toBeNull();
        checked = true;
      }
    }
    expect(checked).toBe(true);
  });

  it('with no candidate placement anywhere inside the circle the game is over', () => {
    const game = createGame({ opening: openingPatch(7), growthMargin: -100 });
    expect(allCandidates(game)).toEqual([]);
    expect(game.status()).toBe('over');
  });
});

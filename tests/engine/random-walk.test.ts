import { describe, expect, it } from 'vitest';
import { createGame, P2, pointKey, type Placement } from '../../src/engine';
import { hasTJunction, overlapArea, polygonOf, sharedEdgeCount } from './oracle';

/** Small deterministic PRNG (mulberry32) so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_STEPS = 500;

describe('random play until a dead end keeps the tiling sound (checked by an independent float oracle)', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i', (seed) => {
    const random = rng(seed);
    const game = createGame();
    let steps = 0;
    while (game.status() === 'playing' && steps < MAX_STEPS) {
      const all: Placement[] = P2.kinds.flatMap((k) => [...game.candidates(k)]);
      if (all.length === 0) break;
      const pick = all[Math.floor(random() * all.length)]!;
      const before = game.tiles();
      expect(game.place(pick)).toBe(true);
      steps++;
      if (game.status() === 'over') break;
      // the new tile overlaps nothing, makes no T-junction, and shares a whole edge
      const v = game.verticesOf(pick);
      const poly = polygonOf(v);
      let shared = 0;
      for (const t of before) {
        expect(overlapArea(poly, polygonOf(t.vertices))).toBeLessThan(1e-9);
        expect(hasTJunction(v, t.vertices)).toBe(false);
        shared += sharedEdgeCount(v, t.vertices);
      }
      expect(shared).toBeGreaterThanOrEqual(1);
    }
    // random play does run into a dead end, and the game ends there
    expect(game.status()).toBe('over');
    expect(game.deadEnds().length).toBeGreaterThan(0);

    const seen = new Set<string>();
    for (const t of game.tiles()) {
      for (const p of t.vertices) {
        if (seen.has(pointKey(p))) continue;
        seen.add(pointKey(p));
        const info = game.vertexAt(p)!;
        // matching rule: every corner on a point carries the same vertex label
        const labels = new Set(info.corners.map((c) => P2.shapes[c.kind]!.corners[c.corner]!.label));
        expect(labels.size, JSON.stringify(info.corners)).toBe(1);
        // every interior vertex is one of the seven configurations
        if (info.complete) expect(info.configuration, JSON.stringify(info.corners)).not.toBeNull();
      }
    }
  });
});

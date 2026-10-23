import { describe, expect, it } from 'vitest';
import { createGame, P2, type Placement } from '../../src/engine';
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

describe('random play keeps the tiling sound (checked by an independent float oracle)', () => {
  it.each([1, 2, 3])('seed %i', (seed) => {
    const random = rng(seed);
    const game = createGame();
    for (let step = 0; step < 40; step++) {
      const tiles = game.tiles();
      const all: Placement[] = P2.kinds.flatMap((k) => [...game.candidates(k)]);
      for (const c of all) {
        const v = game.verticesOf(c);
        const poly = polygonOf(v);
        let shared = 0;
        for (const t of tiles) {
          expect(overlapArea(poly, polygonOf(t.vertices))).toBeLessThan(1e-9);
          expect(hasTJunction(v, t.vertices)).toBe(false);
          shared += sharedEdgeCount(v, t.vertices);
        }
        expect(shared).toBeGreaterThanOrEqual(1);
      }
      if (all.length === 0) break;
      expect(game.place(all[Math.floor(random() * all.length)]!)).toBe(true);
      for (const t of game.tiles()) {
        for (const p of t.vertices) {
          const info = game.vertexAt(p)!;
          if (info.complete) expect(info.configuration, JSON.stringify(info.corners)).not.toBeNull();
        }
      }
    }
  });
});

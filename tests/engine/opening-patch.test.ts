import { describe, expect, it } from 'vitest';
import { createGame, openingPatch, pointKey, type Placement } from '../../src/engine';

const keyOf = (p: Placement) => `${p.kind}@${pointKey(p.origin)}/${p.dir}`;
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

describe('opening patch', () => {
  it('the same seed always gives the same patch', () => {
    for (const seed of [1, 42, 123456789]) {
      expect(openingPatch(seed).map(keyOf)).toEqual(openingPatch(seed).map(keyOf));
    }
  });

  it('different seeds give different patches', () => {
    const distinct = new Set(SEEDS.slice(0, 50).map((s) => openingPatch(s).map(keyOf).sort().join(' ')));
    expect(distinct.size).toBeGreaterThan(10);
  });

  it('has 3 to 6 tiles, each sharing a whole edge with an earlier one', () => {
    const sizes = new Set<number>();
    for (const seed of SEEDS) {
      const patch = openingPatch(seed);
      sizes.add(patch.length);
      expect(patch.length).toBeGreaterThanOrEqual(3);
      expect(patch.length).toBeLessThanOrEqual(6);
      const game = createGame({ opening: patch });
      const edges = (p: Placement) => {
        const vs = game.verticesOf(p).map(pointKey);
        return vs.map((a, i) => [a, vs[(i + 1) % vs.length]!].sort().join('|'));
      };
      patch.slice(1).forEach((tile, i) => {
        const earlier = new Set(patch.slice(0, i + 1).flatMap(edges));
        expect(edges(tile).some((e) => earlier.has(e)), `seed ${seed} tile ${i + 1}`).toBe(true);
      });
    }
    expect([...sizes].sort()).toEqual([3, 4, 5, 6]);
  });

  it('obeys the matching rules: laying the tiles one by one, every tile is a legal placement', () => {
    for (const seed of SEEDS) {
      const [first, ...rest] = openingPatch(seed);
      const game = createGame({ opening: [first!] });
      for (const tile of rest) expect(game.place(tile), `seed ${seed} ${keyOf(tile)}`).toBe(true);
    }
  });

  it('every complete vertex is one of the seven vertex configurations', () => {
    let complete = 0;
    for (const seed of SEEDS) {
      const game = createGame({ opening: openingPatch(seed) });
      for (const tile of game.tiles()) {
        for (const v of tile.vertices) {
          const info = game.vertexAt(v)!;
          if (!info.complete) continue;
          complete++;
          expect(info.configuration, `seed ${seed} ${JSON.stringify(info.corners)}`).not.toBeNull();
        }
      }
    }
    expect(complete).toBeGreaterThan(0);
  });
});

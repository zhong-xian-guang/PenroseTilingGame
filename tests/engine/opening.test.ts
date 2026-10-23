import { describe, expect, it } from 'vitest';
import { createGame, toXY } from '../../src/engine';

describe('new game', () => {
  it('starts with a single kite', () => {
    const game = createGame();
    const tiles = game.tiles();
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.kind).toBe('kite');
  });

  it('stores every vertex as integer a + bφ coefficients', () => {
    const [kite] = createGame().tiles();
    expect(kite!.vertices).toHaveLength(4);
    for (const p of kite!.vertices) {
      for (const c of [p.u, p.v]) {
        expect(Number.isInteger(c.a)).toBe(true);
        expect(Number.isInteger(c.b)).toBe(true);
      }
    }
    // the first vertex of the opening kite sits at the origin
    expect(toXY(kite!.vertices[0]!)).toEqual({ x: 0, y: 0 });
  });
});

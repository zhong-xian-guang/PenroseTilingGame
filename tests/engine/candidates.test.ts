import { describe, expect, it } from 'vitest';
import { createGame, ORIGIN, pointKey, type Game, type Placement } from '../../src/engine';
import { overlapArea, sharedEdgeCount, polygonOf } from './oracle';

const edgesOf = (game: Game, p: Placement) => game.verticesOf(p);

describe('candidate placements around a single kite', () => {
  it('each of the four edges accepts exactly one kite and one dart', () => {
    const game = createGame();
    expect(game.candidates('kite')).toHaveLength(4);
    expect(game.candidates('dart')).toHaveLength(4);
  });

  it('every candidate shares a whole edge with the tiling and does not overlap it', () => {
    const game = createGame();
    const kite = game.tiles()[0]!;
    for (const kind of ['kite', 'dart']) {
      for (const c of game.candidates(kind)) {
        expect(sharedEdgeCount(edgesOf(game, c), kite.vertices)).toBe(1);
        expect(overlapArea(polygonOf(edgesOf(game, c)), polygonOf(kite.vertices))).toBeLessThan(1e-9);
      }
    }
  });

  it('a kite glued to a long edge of the opening kite shares its 72° apex (half a sun)', () => {
    const game = createGame();
    const atApex = game.candidates('kite').filter((c) =>
      edgesOf(game, c).some((v) => pointKey(v) === pointKey(ORIGIN)),
    );
    expect(atApex).toHaveLength(2);
    for (const c of atApex) expect(pointKey(c.origin)).toBe(pointKey(ORIGIN));
  });
});

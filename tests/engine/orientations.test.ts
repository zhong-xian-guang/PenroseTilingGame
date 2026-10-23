import { describe, expect, it } from 'vitest';
import { createGame, ORIGIN, pointKey, toXY, type Game, type Placement, type Point } from '../../src/engine';

const keyOf = (p: Placement) => `${p.kind}@${pointKey(p.origin)}/${p.dir}`;
const touches = (game: Game, p: Placement, at: Point) =>
  game.verticesOf(p).some((v) => pointKey(v) === pointKey(at));

/** A sun with one kite missing: four kites around the origin, apexes together. */
const fourKites = (): Placement[] => [0, 2, 4, 6].map((dir) => ({ kind: 'kite', origin: ORIGIN, dir }));

describe('legal orientations at a position', () => {
  it('at the apex of a single kite: two kites and two darts', () => {
    const game = createGame();
    expect(game.orientationsAt(ORIGIN, 'kite')).toHaveLength(2);
    expect(game.orientationsAt(ORIGIN, 'dart')).toHaveLength(2);
  });

  it('at the 144° tail of a single kite: two kites and two darts (halves of a deuce)', () => {
    const game = createGame();
    const tail = game.tiles()[0]!.vertices[2]!;
    expect(game.orientationsAt(tail, 'kite')).toHaveLength(2);
    expect(game.orientationsAt(tail, 'dart')).toHaveLength(2);
  });

  it('in the 72° gap of a sun missing one kite: exactly the kite that completes the sun', () => {
    const game = createGame({ opening: fourKites() });
    const options = game.orientationsAt(ORIGIN, 'kite');
    expect(options).toHaveLength(1);
    expect(options[0]!.dir).toBe(8);
    expect(pointKey(options[0]!.origin)).toBe(pointKey(ORIGIN));
  });

  it('only lists candidate placements that have a corner on the position', () => {
    const game = createGame({ opening: fourKites() });
    for (const tile of game.tiles()) {
      for (const at of tile.vertices) {
        for (const kind of ['kite', 'dart']) {
          const all = new Set(game.candidates(kind).map(keyOf));
          const here = game.orientationsAt(at, kind);
          for (const p of here) {
            expect(all.has(keyOf(p))).toBe(true);
            expect(touches(game, p, at)).toBe(true);
          }
          const expected = game.candidates(kind).filter((c) => touches(game, c, at));
          expect(new Set(here.map(keyOf))).toEqual(new Set(expected.map(keyOf)));
        }
      }
    }
  });

  it('lists orientations counter-clockwise around the position', () => {
    const game = createGame();
    const at = toXY(ORIGIN);
    const angles = game.orientationsAt(ORIGIN, 'dart').map((p) => {
      const pts = game.verticesOf(p).map(toXY);
      const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length - at.x;
      const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length - at.y;
      return (Math.atan2(cy, cx) + 2 * Math.PI) % (2 * Math.PI);
    });
    expect(angles).toEqual([...angles].sort((a, b) => a - b));
  });

  it('a position with nowhere to go has no orientations', () => {
    const game = createGame();
    expect(game.orientationsAt({ u: { a: 50, b: 0 }, v: { a: 0, b: 0 } }, 'kite')).toEqual([]);
  });
});

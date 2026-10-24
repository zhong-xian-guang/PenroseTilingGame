import { describe, expect, it } from 'vitest';
import { createGame, pointKey, toXY } from '../../src/engine';
import { keyOf } from './helpers';


describe('picking the candidate placement nearest the pointer', () => {
  it('pointing at where a candidate would sit picks that candidate', () => {
    const game = createGame();
    for (const c of game.candidates('dart')) {
      const pts = game.verticesOf(c).map(toXY);
      const centre = { x: pts.reduce((s, p) => s + p.x, 0) / 4, y: pts.reduce((s, p) => s + p.y, 0) / 4 };
      const pick = game.pickNear(centre, 'dart')!;
      expect(keyOf(pick.orientations[pick.index]!)).toBe(keyOf(c));
    }
  });

  it('the picked position is a tiling vertex of the candidate, and its orientations are the legal ones there', () => {
    const game = createGame();
    const pick = game.pickNear({ x: 0.2, y: 0.9 }, 'kite')!;
    const vs = game.verticesOf(pick.orientations[pick.index]!).map(pointKey);
    expect(vs).toContain(pointKey(pick.position));
    expect(game.vertexAt(pick.position)).not.toBeNull();
    expect(pick.orientations.map(keyOf)).toEqual(game.orientationsAt(pick.position, 'kite').map(keyOf));
  });

  it('nothing is picked when the pointer is far from every candidate', () => {
    expect(createGame().pickNear({ x: 40, y: 40 }, 'kite')).toBeNull();
  });
});

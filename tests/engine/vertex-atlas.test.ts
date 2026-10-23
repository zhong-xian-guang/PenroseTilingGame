import { describe, expect, it } from 'vitest';
import { createGame, ORIGIN, P2, pointKey, type Placement, type Point } from '../../src/engine';

const keyOf = (p: Placement) => `${p.kind}@${pointKey(p.origin)}/${p.dir}`;

describe('vertex configurations', () => {
  it('recognises a complete sun', () => {
    const sun: Placement[] = [0, 2, 4, 6, 8].map((dir) => ({ kind: 'kite', origin: ORIGIN, dir }));
    const v = createGame({ opening: sun }).vertexAt(ORIGIN);
    expect(v).not.toBeNull();
    expect(v!.complete).toBe(true);
    expect(v!.configuration).toBe('sun');
    expect(v!.corners).toHaveLength(5);
  });

  it('an incomplete vertex has no configuration yet', () => {
    const v = createGame().vertexAt(ORIGIN);
    expect(v!.complete).toBe(false);
    expect(v!.configuration).toBeNull();
    expect(v!.corners).toEqual([{ kind: 'kite', corner: 0 }]);
  });

  it('a point that is not a vertex of the tiling has no vertex info', () => {
    expect(createGame().vertexAt({ u: { a: 9, b: 0 }, v: { a: 0, b: 0 } })).toBeNull();
  });

  // Published compositions of Conway's seven vertex neighbourhoods
  // (e.g. Gardner, "Penrose Tiles to Trapdoor Ciphers").
  const COMPOSITION: Record<string, { kites: number; darts: number }> = {
    sun: { kites: 5, darts: 0 },
    star: { kites: 0, darts: 5 },
    ace: { kites: 2, darts: 1 },
    deuce: { kites: 2, darts: 2 },
    jack: { kites: 3, darts: 2 },
    queen: { kites: 4, darts: 1 },
    king: { kites: 2, darts: 3 },
  };

  it('the atlas lists exactly the seven configurations with their published compositions', () => {
    const atlas = Object.fromEntries(
      P2.vertexAtlas.map((c) => [
        c.name,
        {
          kites: c.corners.filter((x) => x.kind === 'kite').length,
          darts: c.corners.filter((x) => x.kind === 'dart').length,
        },
      ]),
    );
    expect(atlas).toEqual(COMPOSITION);
  });

  it('every atlas configuration closes a full turn', () => {
    for (const c of P2.vertexAtlas) {
      const turn = c.corners.reduce((s, x) => s + P2.shapes[x.kind]!.corners[x.corner]!.angle * 36, 0);
      expect(turn, c.name).toBe(360);
    }
  });

  it('filling a vertex with candidate placements in every possible way yields exactly the seven configurations', () => {
    const found = new Set<string>();
    const seen = new Set<string>();
    const explore = (tiles: Placement[], at: Point) => {
      const id = pointKey(at) + ' ' + tiles.map(keyOf).sort().join(' ');
      if (seen.has(id)) return;
      seen.add(id);
      const game = createGame({ opening: tiles });
      const v = game.vertexAt(at)!;
      if (v.complete) {
        expect(v.configuration, JSON.stringify(v.corners)).not.toBeNull();
        found.add(v.configuration!);
        return;
      }
      for (const kind of P2.kinds) for (const o of game.orientationsAt(at, kind)) explore([...tiles, o], at);
    };
    for (const kind of P2.kinds) {
      const seed: Placement = { kind, origin: ORIGIN, dir: 0 };
      const corners = createGame({ opening: [seed] }).tiles()[0]!.vertices;
      for (const at of corners) explore([seed], at);
    }
    expect([...found].sort()).toEqual(Object.keys(COMPOSITION).sort());
  });
});

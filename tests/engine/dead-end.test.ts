import { describe, expect, it } from 'vitest';
import { createGame, ORIGIN, pointKey, zphi, type Game, type GameEvent, type Placement, type Point } from '../../src/engine';

const keyOf = (p: Placement) => `${p.kind}@${pointKey(p.origin)}/${((p.dir % 10) + 10) % 10}`;

/**
 * A three-tile dead end found by exhaustive search from the single opening
 * kite: a second kite beside it, then a dart in the gap between them leaves a
 * pocket on the opening kite's edge 2 that no kite or dart fits into.
 */
const secondKite: Placement = { kind: 'kite', origin: { u: zphi(1, 2), v: zphi(0, -1) }, dir: 4 };
const fatalDart: Placement = { kind: 'dart', origin: { u: zphi(0, 0), v: zphi(0, 1) }, dir: 5 };
/** Edge 2 (corner 2 to corner 3) of the opening kite, where the pocket opens. */
const openingEdge2 = (game: Game) => {
  const v = game.tiles()[0]!.vertices;
  return [v[2]!, v[3]!] as const;
};
const sameEdge = (a: readonly [Point, Point], b: readonly [Point, Point]) =>
  [a[0], a[1]].map(pointKey).sort().join('|') === [b[0], b[1]].map(pointKey).sort().join('|');
/** Does a tile have the segment a–b as one of its edges? */
const hasEdge = (vertices: readonly Point[], edge: readonly [Point, Point]) =>
  vertices.some((v, i) => sameEdge([v, vertices[(i + 1) % vertices.length]!], edge));

/** Area of each tile, in squared length units (short edge = 1): kite = φ·sin 72°, dart = φ·sin 36°. */
const KITE_AREA = 1.5388417685876268;
const DART_AREA = 0.9510565162951535;

/** Place a tile that is not involved in the dead end, so the pending dart gets confirmed. */
const placeElsewhere = (game: Game) => {
  const c = [...game.candidates('kite'), ...game.candidates('dart')][0]!;
  expect(game.place(c)).toBe(true);
  return c;
};

describe('visible dead ends', () => {
  it('a fresh game is in play with no dead end and scores its opening', () => {
    const game = createGame();
    expect(game.status()).toBe('playing');
    expect(game.deadEnds()).toEqual([]);
    expect(game.score().tiles).toBe(1);
    expect(game.score().area).toBeCloseTo(KITE_AREA, 12);
  });

  it('a pending tile that leaves an unfillable pocket marks it, but the game goes on', () => {
    const game = createGame();
    expect(game.place(secondKite)).toBe(true);
    expect(game.deadEnds()).toEqual([]);
    expect(game.place(fatalDart)).toBe(true);

    expect(game.status()).toBe('playing');
    const dead = game.deadEnds();
    expect(dead.length).toBeGreaterThan(0);
    expect(dead.every((d) => d.cause === 'pending')).toBe(true);
    const edge = openingEdge2(game);
    expect(dead.some((d) => sameEdge([d.from, d.to], edge))).toBe(true);
    // consistent with the candidates: nothing can be glued onto that edge any more
    for (const c of [...game.candidates('kite'), ...game.candidates('dart')]) {
      expect(hasEdge(game.verticesOf(c), edge)).toBe(false);
    }
  });

  it('removing the pending tile clears the mark', () => {
    const game = createGame();
    game.place(secondKite);
    game.place(fatalDart);
    expect(game.removePending()).toBe(true);
    expect(game.deadEnds()).toEqual([]);
    expect(game.status()).toBe('playing');
  });

  it('turning the pending tile to an orientation that leaves no pocket clears the mark', () => {
    const game = createGame();
    game.place(secondKite);
    game.place(fatalDart);
    // try every other orientation at its position: at least one leaves no dead end
    let cleared = false;
    for (let i = 0; i < 4 && !cleared; i++) {
      if (!game.turnPending()) break;
      cleared = game.deadEnds().length === 0;
    }
    expect(cleared).toBe(true);
    expect(game.status()).toBe('playing');
  });

  it('placing the next tile without fixing it ends the game; the new tile is not counted', () => {
    const game = createGame();
    game.place(secondKite);
    game.place(fatalDart);
    const events: GameEvent['type'][] = [];
    game.subscribe((e) => events.push(e.type));
    const next = placeElsewhere(game);

    expect(game.status()).toBe('over');
    expect(events).toContain('game-over');
    expect(game.pendingTile()).toBeNull();
    expect(game.tiles().map(keyOf)).toEqual(
      [{ kind: 'kite', origin: ORIGIN, dir: 0 } as Placement, secondKite, fatalDart].map(keyOf),
    );
    expect(game.tiles().map(keyOf)).not.toContain(keyOf(next));
    expect(game.deadEnds().length).toBeGreaterThan(0);
    expect(game.deadEnds().every((d) => d.cause === 'confirmed')).toBe(true);
    expect(game.score()).toEqual({ tiles: 3, area: expect.closeTo(2 * KITE_AREA + DART_AREA, 12) });
  });

  it('once the game is over every placing command is refused', () => {
    const game = createGame();
    game.place(secondKite);
    game.place(fatalDart);
    placeElsewhere(game);
    const before = game.tiles().map(keyOf);
    for (const c of [...game.candidates('kite'), ...game.candidates('dart')]) expect(game.place(c)).toBe(false);
    expect(game.turnPending()).toBe(false);
    expect(game.removePending()).toBe(false);
    expect(game.tiles().map(keyOf)).toEqual(before);
  });
});

describe('score', () => {
  it('is the total area of the confirmed tiling; kite and dart areas are in ratio φ', () => {
    const game = createGame();
    game.place(game.candidates('dart')[0]!);
    // the pending dart does not count yet
    expect(game.score()).toEqual({ tiles: 1, area: expect.closeTo(KITE_AREA, 12) });
    placeElsewhere(game);
    expect(game.score()).toEqual({ tiles: 2, area: expect.closeTo(KITE_AREA + DART_AREA, 12) });
    expect(KITE_AREA / DART_AREA).toBeCloseTo((1 + Math.sqrt(5)) / 2, 12);
  });
});

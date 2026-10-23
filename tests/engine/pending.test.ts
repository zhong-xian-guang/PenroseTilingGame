import { describe, expect, it } from 'vitest';
import { createGame, ORIGIN, pointKey, type Placement } from '../../src/engine';

const keyOf = (p: Placement) => `${p.kind}@${pointKey(p.origin)}/${((p.dir % 10) + 10) % 10}`;
const sameP = (a: Placement, b: Placement) => keyOf(a) === keyOf(b);

const opening: Placement = { kind: 'kite', origin: ORIGIN, dir: 0 };

describe('the pending tile', () => {
  it('a new game has no pending tile; the opening is confirmed', () => {
    const game = createGame();
    expect(game.pendingTile()).toBeNull();
    expect(game.confirmedTiles()).toHaveLength(1);
    expect(sameP(game.confirmedTiles()[0]!, opening)).toBe(true);
  });

  it('the tile just placed is pending, separate from the confirmed tiling', () => {
    const game = createGame();
    const c = game.candidates('dart')[0]!;
    game.place(c);
    expect(sameP(game.pendingTile()!, c)).toBe(true);
    expect(game.confirmedTiles().map(keyOf)).toEqual([keyOf(opening)]);
    // tiles() still lists everything on the board
    expect(game.tiles()).toHaveLength(2);
  });

  it('removing the pending tile puts the board back as it was before it was placed', () => {
    const game = createGame();
    game.place(game.candidates('kite')[0]!);
    const before = {
      tiles: game.tiles().map(keyOf),
      kites: game.candidates('kite').map(keyOf).sort(),
      darts: game.candidates('dart').map(keyOf).sort(),
    };
    game.place(game.candidates('dart')[2]!);
    expect(game.removePending()).toBe(true);
    expect(game.pendingTile()).toBeNull();
    expect({
      tiles: game.tiles().map(keyOf),
      kites: game.candidates('kite').map(keyOf).sort(),
      darts: game.candidates('dart').map(keyOf).sort(),
    }).toEqual(before);
    // the tile before it was confirmed when the dart went down, so there is nothing more to remove
    expect(game.removePending()).toBe(false);
    expect(game.tiles().map(keyOf)).toEqual(before.tiles);
  });

  it('removing tells subscribers the tiling changed', () => {
    const game = createGame();
    game.place(game.candidates('kite')[0]!);
    const events: string[] = [];
    game.subscribe((e) => events.push(e.type));
    game.removePending();
    game.removePending();
    expect(events).toEqual(['tiling-changed']);
  });
});

/** A sun with one kite missing: four kites around the origin, apexes together. */
const fourKites = (): Placement[] => [0, 2, 4, 6].map((dir) => ({ kind: 'kite', origin: ORIGIN, dir }));

describe('turning the pending tile', () => {
  it('cycles through the legal orientations at the position it was placed at, both ways', () => {
    const game = createGame();
    // at the apex of a single kite a dart fits in exactly two orientations
    const options = game.orientationsAt(ORIGIN, 'dart');
    expect(options).toHaveLength(2);
    game.place(options[0]!, ORIGIN);

    expect(game.turnPending()).toBe(true);
    expect(sameP(game.pendingTile()!, options[1]!)).toBe(true);
    expect(game.turnPending()).toBe(true);
    expect(sameP(game.pendingTile()!, options[0]!)).toBe(true);
    expect(game.turnPending(-1)).toBe(true);
    expect(sameP(game.pendingTile()!, options[1]!)).toBe(true);

    // it stays the pending tile; the confirmed tiling is untouched
    expect(game.tiles()).toHaveLength(2);
    expect(game.confirmedTiles().map(keyOf)).toEqual([keyOf(opening)]);
  });

  it('a pending tile with only one legal orientation does not turn', () => {
    const game = createGame({ opening: fourKites() });
    const [only] = game.orientationsAt(ORIGIN, 'kite');
    game.place(only!, ORIGIN);
    expect(game.turnPending()).toBe(false);
    expect(sameP(game.pendingTile()!, only!)).toBe(true);
  });

  it('never turns into an orientation that is not legal against the confirmed tiling', () => {
    const game = createGame({ opening: fourKites() });
    const tail = game.tiles()[0]!.vertices[2]!;
    for (const kind of ['kite', 'dart']) {
      const legal = new Set(game.orientationsAt(tail, kind).map(keyOf));
      game.place(game.orientationsAt(tail, kind)[0]!, tail);
      const seen = new Set<string>();
      for (let i = 0; i < 6; i++) {
        game.turnPending();
        seen.add(keyOf(game.pendingTile()!));
      }
      expect(seen).toEqual(legal);
      game.removePending();
    }
  });

  it('turning tells subscribers the tiling changed', () => {
    const game = createGame();
    game.place(game.orientationsAt(ORIGIN, 'dart')[0]!, ORIGIN);
    const events: string[] = [];
    game.subscribe((e) => events.push(e.type));
    game.turnPending();
    expect(events).toEqual(['tiling-changed']);
  });

  it('a game without a pending tile has nothing to turn', () => {
    const game = createGame();
    expect(game.turnPending()).toBe(false);
    expect(game.tiles().map(keyOf)).toEqual([keyOf(opening)]);
  });
});

describe('confirming', () => {
  it('placing the next tile confirms the pending one, which can then never be turned or removed', () => {
    const game = createGame();
    const first = game.orientationsAt(ORIGIN, 'dart')[0]!;
    game.place(first, ORIGIN);
    const second = game.candidates('kite')[0]!;
    game.place(second);

    expect(game.confirmedTiles().map(keyOf)).toEqual([keyOf(opening), keyOf(first)]);
    expect(sameP(game.pendingTile()!, second)).toBe(true);

    // only the newest tile is adjustable
    expect(game.removePending()).toBe(true);
    expect(game.turnPending()).toBe(false);
    expect(game.removePending()).toBe(false);
    expect(game.tiles().map(keyOf)).toEqual([keyOf(opening), keyOf(first)]);
    expect(game.pendingTile()).toBeNull();
  });

  it('a refused placement leaves the pending tile pending', () => {
    const game = createGame();
    const first = game.orientationsAt(ORIGIN, 'dart')[0]!;
    game.place(first, ORIGIN);
    expect(game.place(opening)).toBe(false);
    expect(sameP(game.pendingTile()!, first)).toBe(true);
    expect(game.turnPending()).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { createGame, ORIGIN, pointKey, zphi, type Placement, type GameEvent } from '../../src/engine';
import { overlapArea, polygonOf, sharedEdgeCount } from './oracle';

const sameP = (a: Placement, b: Placement) =>
  a.kind === b.kind && a.dir === b.dir && pointKey(a.origin) === pointKey(b.origin);

describe('placing tiles', () => {
  it('placing a candidate adds it to the tiling', () => {
    const game = createGame();
    const c = game.candidates('dart')[0]!;
    expect(game.place(c)).toBe(true);
    expect(game.tiles()).toHaveLength(2);
    expect(sameP(game.tiles()[1]!, c)).toBe(true);
  });

  it('refuses a placement that is not a candidate and leaves the tiling unchanged', () => {
    const game = createGame();
    // a second kite exactly on top of the first
    expect(game.place({ kind: 'kite', origin: ORIGIN, dir: 0 })).toBe(false);
    // a kite far away, sharing no edge
    expect(game.place({ kind: 'kite', origin: { u: zphi(10), v: zphi(10) }, dir: 0 })).toBe(false);
    expect(game.tiles()).toHaveLength(1);
  });

  it('notifies subscribers when the tiling changes', () => {
    const game = createGame();
    const events: GameEvent[] = [];
    const off = game.subscribe((e) => events.push(e));
    game.place(game.candidates('kite')[0]!);
    off();
    game.place(game.candidates('kite')[0]!);
    expect(events).toEqual([{ type: 'tiling-changed' }]);
  });

  it('remembers which tile kind is selected in the tray', () => {
    const game = createGame();
    expect(game.selectedKind()).toBeNull();
    game.select('dart');
    expect(game.selectedKind()).toBe('dart');
    game.select(null);
    expect(game.selectedKind()).toBeNull();
    expect(() => game.select('rhomb')).toThrow();
  });
});

describe('candidates exclude overlapping placements', () => {
  // A kite with a dart glued to it. The second dart below shares a short edge
  // with the first and both notches (216°, matching labels) sit on the same
  // point, so it is glued edge-to-edge with matching labels, yet its arm
  // covers part of the first dart.
  const opening: Placement[] = [
    { kind: 'kite', origin: ORIGIN, dir: 0 },
    { kind: 'dart', origin: { u: zphi(1, 1), v: zphi(0, -1) }, dir: 5 },
  ];
  const overlapping: Placement = { kind: 'dart', origin: { u: zphi(0), v: zphi(1, -1) }, dir: 9 };

  it('the scenario is what it claims to be', () => {
    const game = createGame({ opening: opening.slice(0, 1) });
    expect(game.candidates('dart').some((c) => sameP(c, opening[1]!))).toBe(true);
    const full = createGame({ opening });
    const v = full.verticesOf(overlapping);
    const dart = full.tiles()[1]!;
    expect(sharedEdgeCount(v, dart.vertices)).toBe(1);
    expect(pointKey(v[2]!)).toBe(pointKey(dart.vertices[2]!));
    expect(overlapArea(polygonOf(v), polygonOf(dart.vertices))).toBeGreaterThan(0.1);
  });

  it('is not offered as a candidate', () => {
    const game = createGame({ opening });
    expect(game.candidates('dart').some((c) => sameP(c, overlapping))).toBe(false);
    expect(game.place(overlapping)).toBe(false);
  });
});

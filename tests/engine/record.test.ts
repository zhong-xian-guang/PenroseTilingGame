import { describe, expect, it } from 'vitest';
import {
  createGame,
  decodeRecord,
  encodeRecord,
  openingPatch,
  ORIGIN,
  P2,
  replayRecord,
  type Game,
} from '../../src/engine';
import { keyOf } from './helpers';


/** Everything a player can see of a position: confirmed tiling, pending tile, and what fits next. */
const snapshot = (game: Game) => ({
  confirmed: game.confirmedTiles().map(keyOf),
  pending: game.pendingTile() && keyOf(game.pendingTile()!),
  kites: game.candidates('kite').map(keyOf).sort(),
  darts: game.candidates('dart').map(keyOf).sort(),
});

/** A short game exercising every kind of step: place, turn both ways, remove, place again. */
const playSome = (game: Game) => {
  const at = game.confirmedTiles()[0]!.vertices[0]!;
  const options = game.orientationsAt(at, 'dart');
  game.place(options[0]!, at);
  game.turnPending();
  game.place(game.candidates('kite')[1]!);
  game.turnPending(-1);
  game.removePending();
  game.place(game.candidates('kite')[0]!);
  game.place(game.candidates('dart')[2]!);
  game.turnPending();
};

describe('the game record', () => {
  it('encoding, decoding and replaying it gives back exactly the same position, pending tile included', () => {
    const game = createGame({ tileSet: P2, opening: openingPatch(42), seed: 42 });
    playSome(game);
    expect(game.pendingTile()).not.toBeNull();

    const replayed = replayRecord(decodeRecord(encodeRecord(game.record())));
    expect(snapshot(replayed)).toEqual(snapshot(game));
    // and the pending tile is still adjustable after the replay: turning it behaves the same way
    expect(replayed.turnPending()).toBe(game.turnPending());
    expect(snapshot(replayed)).toEqual(snapshot(game));
  });

  it('a removed pending tile stays removed after the replay', () => {
    const game = createGame();
    game.place(game.candidates('kite')[0]!);
    game.place(game.candidates('dart')[0]!);
    game.removePending();
    const replayed = replayRecord(decodeRecord(encodeRecord(game.record())));
    expect(replayed.pendingTile()).toBeNull();
    expect(snapshot(replayed)).toEqual(snapshot(game));
  });

  it('a fresh game records its opening and no steps', () => {
    const game = createGame({ opening: openingPatch(7), seed: 7 });
    const record = game.record();
    expect(record.tileSet).toBe('P2');
    expect(record.seed).toBe(7);
    expect(record.opening.map(keyOf)).toEqual(openingPatch(7).map(keyOf));
    expect(record.steps).toEqual([]);
  });

  it('only steps that changed the board are recorded', () => {
    const game = createGame();
    expect(game.removePending()).toBe(false);
    expect(game.place({ kind: 'kite', origin: ORIGIN, dir: 0 })).toBe(false); // overlaps the opening
    game.select('dart');
    expect(game.record().steps).toEqual([]);
  });
});

describe('the encoded record', () => {
  it('carries a format version, and decoding refuses any other version', () => {
    const game = createGame();
    game.place(game.candidates('kite')[0]!);
    const encoded = encodeRecord(game.record());
    expect(JSON.parse(encoded).version).toBe(1);

    const future = JSON.stringify({ ...JSON.parse(encoded), version: 2 });
    expect(() => decodeRecord(future)).toThrow(/version/i);
    const unversioned = JSON.stringify({ ...JSON.parse(encoded), version: undefined });
    expect(() => decodeRecord(unversioned)).toThrow(/version/i);
  });

  it('decoding refuses text that is not a record', () => {
    expect(() => decodeRecord('not json')).toThrow();
    expect(() => decodeRecord('{"version":1}')).toThrow();
  });

  it('replaying refuses a record whose steps are not legal', () => {
    const game = createGame();
    game.place(game.candidates('kite')[0]!);
    const record = game.record();
    const overlapping = { ...record, steps: [{ ...record.steps[0]!, placement: record.opening[0]! }] };
    expect(() => replayRecord(overlapping)).toThrow();
  });

  it('replaying refuses an unknown tile set', () => {
    expect(() => replayRecord({ ...createGame().record(), tileSet: 'P3' })).toThrow(/P3/);
  });
});

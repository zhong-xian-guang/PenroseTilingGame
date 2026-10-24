import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, decodeRecord, encodeRecord, openingPatch, replayRecord } from '../../src/engine';
import { allCandidates, keyOf, rng } from './helpers';

/**
 * Deterministic replay (and, later, server-side verification) needs every
 * rule decision to come out the same on every platform. IEEE-754 pins down
 * + - * / and sqrt exactly, but not Math.hypot, Math.sin and friends, so none
 * of those may be on the rule path.
 */
const UNSPECIFIED = [
  'hypot', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt',
] as const;

afterEach(() => vi.restoreAllMocks());

describe('rule decisions are deterministic', () => {
  it.each([3, 11])('play, turn, remove and replay without implementation-defined Math functions (seed %i)', (seed) => {
    for (const name of UNSPECIFIED) {
      vi.spyOn(Math, name).mockImplementation(() => {
        throw new Error(`Math.${name} called on the rule path`);
      });
    }
    const random = rng(seed);
    const game = createGame({ opening: openingPatch(seed), seed });
    for (let i = 0; i < 40 && game.status() === 'playing'; i++) {
      game.growthCircle();
      game.flowSpot();
      if (game.deadEnds().length > 0) {
        expect(game.removePending()).toBe(true);
        continue;
      }
      const all = allCandidates(game);
      if (all.length === 0) break;
      expect(game.place(all[Math.floor(random() * all.length)]!)).toBe(true);
      if (random() < 0.3) game.turnPending(random() < 0.5 ? 1 : -1);
    }
    const replay = replayRecord(decodeRecord(encodeRecord(game.record())));
    expect(replay.tiles().map(keyOf)).toEqual(game.tiles().map(keyOf));
    expect(replay.score()).toEqual(game.score());
  });
});

import { describe, expect, it } from 'vitest';
import { createGame, P2, pointKey, type Game, type Placement } from '../../src/engine';

/**
 * The engine keeps candidates and dead ends up to date incrementally (only
 * the area around a changed tile is recomputed). These tests pin that to a
 * full recompute: a fresh game whose opening is the same tiles has no
 * history, so everything it reports is computed from scratch.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const keyOf = (p: Placement) => `${p.kind}@${pointKey(p.origin)}/${((p.dir % 10) + 10) % 10}`;
const candidateKeys = (game: Game) => P2.kinds.flatMap((k) => game.candidates(k).map(keyOf)).sort();
const deadKeys = (game: Game) => game.deadEnds().map((d) => `${pointKey(d.from)}>${pointKey(d.to)}`).sort();
const asOpening = (game: Game): Placement[] => game.tiles().map(({ kind, origin, dir }) => ({ kind, origin, dir }));

describe('incremental candidates and dead ends agree with a full recompute', () => {
  it.each([1, 2, 3, 4, 5, 6])('random places, turns and removals, no growth circle (seed %i)', (seed) => {
    const random = rng(seed);
    const game = createGame({ growthMargin: Infinity });
    for (let step = 0; step < 60 && game.status() === 'playing'; step++) {
      const r = random();
      if (game.pendingTile() && r < 0.2) game.turnPending(random() < 0.5 ? 1 : -1);
      else if (game.pendingTile() && r < 0.3) game.removePending();
      else {
        const all = P2.kinds.flatMap((k) => [...game.candidates(k)]);
        if (all.length === 0) break;
        game.place(all[Math.floor(random() * all.length)]!);
        if (game.status() === 'over') break;
      }
      const fresh = createGame({ growthMargin: Infinity, opening: asOpening(game) });
      expect(candidateKeys(game), `step ${step}`).toEqual(candidateKeys(fresh));
      expect(deadKeys(game), `step ${step}`).toEqual(deadKeys(fresh));
    }
  });

  it.each([7, 8, 9])('with the growth circle, after each place (seed %i)', (seed) => {
    const random = rng(seed);
    const game = createGame();
    for (let step = 0; step < 40 && game.status() === 'playing'; step++) {
      const all = P2.kinds.flatMap((k) => [...game.candidates(k)]);
      if (all.length === 0) break;
      game.place(all[Math.floor(random() * all.length)]!);
      const pending = game.pendingTile();
      if (game.status() === 'over' || !pending) break;
      // same confirmed tiling, freshly built, then the same pending tile put down
      const fresh = createGame({ opening: game.confirmedTiles().map(({ kind, origin, dir }) => ({ kind, origin, dir })) });
      expect(fresh.place(pending)).toBe(true);
      expect(candidateKeys(game), `step ${step}`).toEqual(candidateKeys(fresh));
      expect(deadKeys(game), `step ${step}`).toEqual(deadKeys(fresh));
    }
  });
});

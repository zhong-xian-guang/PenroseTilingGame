/**
 * Small helpers shared by the engine tests (built on the public engine API only).
 */
import { P2, pointKey, type Game, type Placement } from '../../src/engine';

/** mulberry32: a small deterministic PRNG returning [0, 1), so random tests are reproducible. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Canonical key of a placement (direction taken mod 10). */
export const keyOf = (p: Placement): string => `${p.kind}@${pointKey(p.origin)}/${((p.dir % 10) + 10) % 10}`;

/** Every candidate placement of every kind. */
export const allCandidates = (game: Game): Placement[] => P2.kinds.flatMap((k) => [...game.candidates(k)]);

/** The tiles of a game as plain placements (e.g. to use them as another game's opening). */
export const asOpening = (tiles: readonly Placement[]): Placement[] =>
  tiles.map(({ kind, origin, dir }) => ({ kind, origin, dir }));

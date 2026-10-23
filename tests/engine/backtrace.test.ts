import { describe, expect, it } from 'vitest';
import { backtraceRecord, createGame, openingPatch, P2, pointKey, type Placement } from '../../src/engine';

/** Small deterministic PRNG (mulberry32) so failures are reproducible. */
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

/** Random play until the game is over (a visible dead end). */
function playRandomly(seed: number) {
  const random = rng(seed);
  const game = createGame();
  while (game.status() === 'playing') {
    const all: Placement[] = P2.kinds.flatMap((k) => [...game.candidates(k)]);
    game.place(all[Math.floor(random() * all.length)]!);
  }
  return game;
}

type Game = ReturnType<typeof createGame>;

/**
 * A genuine Penrose patch played tile by tile: its first tile is the opening,
 * the others are placed in the order `openingPatch` grew them (each one shares
 * an edge with the ones before). Every position along the way is part of a real
 * Penrose tiling, so none of them can be doomed.
 */
function playGenuinePatch(seed: number): Game {
  const patch = openingPatch(seed);
  const game = createGame({ opening: patch.slice(0, 1) });
  for (const p of patch.slice(1)) expect(game.place(p)).toBe(true);
  return game;
}

const vertexKeys = (game: Game, p: Placement) => game.verticesOf(p).map(pointKey);

/** Boundary edges of a set of tiles: directed tile edges (CCW) whose reverse belongs to no tile. */
function boundaryEdges(game: Game, tiles: readonly Placement[]): [string, string][] {
  const edges = tiles.flatMap((t) => {
    const k = vertexKeys(game, t);
    return k.map((a, i) => [a, k[(i + 1) % k.length]!] as [string, string]);
  });
  const all = new Set(edges.map(([a, b]) => `${a}>${b}`));
  return edges.filter(([a, b]) => !all.has(`${b}>${a}`));
}

/** Every legal tile glued onto the boundary edge a→b of `tiles` (no growth circle). */
function fillers(tiles: readonly Placement[], [a, b]: [string, string]): Placement[] {
  const probe = createGame({ opening: tiles, growthMargin: Infinity });
  return P2.kinds
    .flatMap((k) => [...probe.candidates(k)])
    .filter((p) => {
      const k = vertexKeys(probe, p);
      return k.some((x, i) => x === b && k[(i + 1) % k.length] === a);
    });
}

const hasVisibleDeadEnd = (tiles: readonly Placement[]) =>
  createGame({ opening: tiles, growthMargin: Infinity }).deadEnds().length > 0;

/**
 * A hidden mistake after `game`: a candidate that leaves no visible dead end,
 * but leaves a boundary edge with exactly one legal filler, and that forced
 * tile does make a visible dead end. So the position is doomed although
 * nothing shows yet.
 */
function findHiddenMistake(game: Game): Placement | null {
  const board = game.tiles();
  for (const c of P2.kinds.flatMap((k) => [...game.candidates(k)])) {
    const tiles = [...board, c];
    if (hasVisibleDeadEnd(tiles)) continue;
    for (const edge of boundaryEdges(game, tiles)) {
      const only = fillers(tiles, edge);
      if (only.length === 1 && hasVisibleDeadEnd([...tiles, only[0]!])) return c;
    }
  }
  return null;
}

/** Keep playing randomly until the game is over. */
function finishRandomly(game: Game, seed: number) {
  const random = rng(seed);
  while (game.status() === 'playing') {
    const all: Placement[] = P2.kinds.flatMap((k) => [...game.candidates(k)]);
    game.place(all[Math.floor(random() * all.length)]!);
  }
}

describe('backtraceRecord: known positions', () => {
  it('a genuine Penrose patch is never doomed', () => {
    for (const seed of [1, 2, 3]) expect(backtraceRecord(playGenuinePatch(seed).record()).doomedAt).toBeNull();
  });

  it('reports the step that left a visible dead end, not the one that ended the game', () => {
    const game = playGenuinePatch(7);
    const bad = P2.kinds
      .flatMap((k) => [...game.candidates(k)])
      .find((c) => hasVisibleDeadEnd([...game.tiles(), c]))!;
    expect(bad).toBeDefined();
    expect(game.place(bad)).toBe(true);
    const badStep = game.record().steps.length;
    finishRandomly(game, 7);
    const record = game.record();
    expect(record.steps.length).toBeGreaterThan(badStep);
    expect(backtraceRecord(record).doomedAt).toBe(badStep);
  });

  it('finds a mistake that only forced tiles reveal, long before the game ends', () => {
    // the patch of seed 6 (the first of seeds 1, 2, ... that has one) can be followed by a hidden mistake
    const game = playGenuinePatch(6);
    const mistake = findHiddenMistake(game);
    expect(mistake).not.toBeNull();
    expect(game.place(mistake!)).toBe(true);
    const mistakeStep = game.record().steps.length;
    finishRandomly(game, 11);
    const record = game.record();
    expect(record.steps.length).toBeGreaterThan(mistakeStep + 1);
    expect(backtraceRecord(record).doomedAt).toBe(mistakeStep);
  }, 20_000);

  it('ignores an orientation that was turned away before the next tile', () => {
    const game = playGenuinePatch(7);
    const bad = P2.kinds
      .flatMap((k) => [...game.candidates(k)])
      .find((c) => hasVisibleDeadEnd([...game.tiles(), c]))!;
    expect(game.place(bad)).toBe(true);
    const badStep = game.record().steps.length;
    expect(game.removePending()).toBe(true);
    // a genuine continuation: nothing doomed it before this point
    finishRandomly(game, 3);
    const { doomedAt } = backtraceRecord(game.record());
    expect(doomedAt).not.toBe(badStep);
    expect(doomedAt!).toBeGreaterThan(badStep + 1);
  });
});

describe('backtraceRecord: the step by which the game was doomed at the latest', () => {
  it.each([1, 2, 3, 4])('reports a step no later than the game-ending one (seed %i)', (seed) => {
    const record = playRandomly(seed).record();
    const { doomedAt } = backtraceRecord(record);
    expect(doomedAt).not.toBeNull();
    expect(doomedAt!).toBeGreaterThanOrEqual(1);
    expect(doomedAt!).toBeLessThanOrEqual(record.steps.length);
  });
});

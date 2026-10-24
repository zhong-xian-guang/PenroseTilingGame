/**
 * Opening patch generator: a seeded, connected 3–6 tile piece cut from a P2
 * reference tiling. The reference tiling comes from repeatedly deflating a sun
 * of five kites, so any connected piece of it is a legal Penrose patch.
 *
 * Deflation is done on Robinson half-tiles in exact ℤ[φ] arithmetic: start
 * with the sun scaled by φⁿ and deflate n times, which lands on unit tiles
 * without ever dividing (the cut points sit at fractions ψ = φ − 1 and
 * ψ² = 2 − φ of an edge, both in ℤ[φ]).
 */
import { placementVertices, type Placement } from './geometry';
import { P2 } from './p2';
import { DIRECTIONS, ORIGIN, minus, plus, pointKey, samePoint, scale, toXY, unit, type Point } from './point';
import { dist2, PHI } from './real';
import { edgeKey } from './tiling';
import type { TileKind } from './tileset';
import { Z1, ZPHI, mul, zphi, type ZPhi } from './zphi';

/** A Robinson half-tile: the tile's corner 0 (apex), one outer corner, and the far end of the symmetry axis. */
interface Half {
  readonly kind: 'kite' | 'dart';
  readonly apex: Point;
  readonly outer: Point;
  readonly axisEnd: Point;
}

const PSI: ZPhi = zphi(-1, 1); // 1/φ = φ − 1
const PSI2: ZPhi = zphi(2, -1); // 1/φ² = 2 − φ

/** The point a fraction `t` of the way from `a` to `b`. */
const along = (a: Point, b: Point, t: ZPhi): Point => plus(a, scale(t, minus(b, a)));

function deflate(h: Half): Half[] {
  if (h.kind === 'kite') {
    const p = along(h.apex, h.axisEnd, PSI);
    const q = along(h.apex, h.outer, PSI2);
    return [
      { kind: 'kite', apex: h.outer, outer: h.axisEnd, axisEnd: p },
      { kind: 'kite', apex: h.outer, outer: q, axisEnd: p },
      { kind: 'dart', apex: h.apex, outer: p, axisEnd: q },
    ];
  }
  const r = along(h.apex, h.outer, PSI);
  return [
    { kind: 'kite', apex: h.apex, outer: r, axisEnd: h.axisEnd },
    { kind: 'dart', apex: h.outer, outer: h.axisEnd, axisEnd: r },
  ];
}

/** Axis length of a unit tile: kite φ, dart 1. */
const AXIS: Record<Half['kind'], ZPhi> = { kite: ZPHI, dart: Z1 };

function directionOf(v: Point, length: ZPhi): number {
  for (let k = 0; k < DIRECTIONS; k++) if (samePoint(v, scale(length, unit(k)))) return k;
  throw new Error('opening: half-tile axis is not along one of the ten directions');
}

const DEFLATIONS = 5;

/** The reference tiling (whole tiles only; unpaired boundary halves are dropped). */
function buildReference(): Placement[] {
  let size = Z1;
  for (let i = 0; i <= DEFLATIONS; i++) size = mul(size, ZPHI); // long edge φ · φⁿ
  let halves: Half[] = [];
  for (let d = 0; d < DIRECTIONS; d += 2) {
    for (const side of [-1, 1]) {
      halves.push({
        kind: 'kite',
        apex: ORIGIN,
        outer: scale(size, unit(d + side)),
        axisEnd: scale(size, unit(d)),
      });
    }
  }
  for (let i = 0; i < DEFLATIONS; i++) halves = halves.flatMap(deflate);

  const groups = new Map<string, Half[]>();
  for (const h of halves) {
    const key = `${h.kind}|${pointKey(h.apex)}|${pointKey(h.axisEnd)}`;
    const g = groups.get(key);
    if (g) g.push(h);
    else groups.set(key, [h]);
  }
  const tiles: Placement[] = [];
  for (const g of groups.values()) {
    if (g.length !== 2) continue;
    const h = g[0]!;
    tiles.push({ kind: h.kind as TileKind, origin: h.apex, dir: directionOf(minus(h.axisEnd, h.apex), AXIS[h.kind]) });
  }
  return tiles;
}

interface Reference {
  readonly tiles: readonly Placement[];
  /** Indices of the tiles sharing a whole edge with each tile. */
  readonly neighbours: readonly (readonly number[])[];
  /** Tiles far enough from the reference boundary to start a patch from. */
  readonly starts: readonly number[];
}

let reference: Reference | null = null;

function getReference(): Reference {
  if (reference) return reference;
  const tiles = buildReference();
  const byEdge = new Map<string, number[]>();
  tiles.forEach((t, i) => {
    const vs = placementVertices(P2, t).map(pointKey);
    vs.forEach((a, j) => {
      const b = vs[(j + 1) % vs.length]!;
      const key = edgeKey(a, b);
      const list = byEdge.get(key);
      if (list) list.push(i);
      else byEdge.set(key, [i]);
    });
  });
  const neighbours: number[][] = tiles.map(() => []);
  for (const list of byEdge.values()) {
    if (list.length !== 2) continue;
    neighbours[list[0]!]!.push(list[1]!);
    neighbours[list[1]!]!.push(list[0]!);
  }
  let radius = 1;
  for (let i = 0; i <= DEFLATIONS; i++) radius *= PHI;
  const starts = tiles
    .map((t, i) => ({ i, at: toXY(t.origin) }))
    .filter(({ at }) => dist2(at, { x: 0, y: 0 }) < (radius / 2) * (radius / 2))
    .map(({ i }) => i);
  reference = { tiles, neighbours, starts };
  return reference;
}

/** mulberry32: a small, fast, deterministic 32-bit PRNG returning [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const OPENING_MIN_TILES = 3;
export const OPENING_MAX_TILES = 6;

/**
 * The opening patch for `seed`: 3 to 6 P2 tiles, edge-connected and legal,
 * listed so that every tile shares a whole edge with an earlier one. The first
 * tile's corner 0 sits at the origin. The same seed always gives the same patch.
 */
export function openingPatch(seed: number): Placement[] {
  const ref = getReference();
  const random = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!;

  const count = OPENING_MIN_TILES + Math.floor(random() * (OPENING_MAX_TILES - OPENING_MIN_TILES + 1));
  const chosen = [pick(ref.starts)];
  while (chosen.length < count) {
    const frontier = [...new Set(chosen.flatMap((i) => ref.neighbours[i]!))]
      .filter((i) => !chosen.includes(i))
      .sort((a, b) => a - b);
    chosen.push(pick(frontier));
  }

  const shift = ref.tiles[chosen[0]!]!.origin;
  return chosen.map((i) => {
    const t = ref.tiles[i]!;
    return { kind: t.kind, origin: minus(t.origin, shift), dir: t.dir };
  });
}

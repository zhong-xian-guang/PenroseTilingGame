/**
 * Exact points in the plane of a Penrose tiling.
 *
 * Every vertex is u·e₀ + v·e₁ with u, v ∈ ℤ[φ], where eₖ is the unit vector at
 * angle 36°·k. All ten directions eₖ have exact coordinates in this basis
 * (e₂ = φe₁ − e₀, e₃ = φe₁ − φe₀, e₄ = e₁ − φe₀, eₖ₊₅ = −eₖ), so tiles built
 * from unit/φ edges along those directions stay exact forever.
 *
 * Because e₀ × e₁ = sin 36° > 0, the sign of a cross product reduces to the
 * sign of an ℤ[φ] number; no floating point is used for any decision.
 */
import { COS36, SIN36 } from './real';
import { Z0, Z1, ZPHI, add, eq, mul, neg, sign, sub, toNumber, zphi, type ZPhi } from './zphi';

export interface Point {
  readonly u: ZPhi;
  readonly v: ZPhi;
}

export const point = (u: ZPhi, v: ZPhi): Point => ({ u, v });

export const ORIGIN: Point = point(Z0, Z0);

/** Number of distinct directions; directions are integers mod 10, each 36°. */
export const DIRECTIONS = 10;

const BASE: readonly Point[] = [
  point(Z1, Z0), // e0
  point(Z0, Z1), // e1
  point(zphi(-1), ZPHI), // e2
  point(zphi(0, -1), ZPHI), // e3
  point(zphi(0, -1), Z1), // e4
];

export const mod10 = (k: number): number => ((k % DIRECTIONS) + DIRECTIONS) % DIRECTIONS;

/** Unit vector at angle 36°·k. */
export function unit(k: number): Point {
  const m = mod10(k);
  const e = BASE[m % 5]!;
  return m < 5 ? e : point(neg(e.u), neg(e.v));
}

export const plus = (p: Point, q: Point): Point => point(add(p.u, q.u), add(p.v, q.v));
export const minus = (p: Point, q: Point): Point => point(sub(p.u, q.u), sub(p.v, q.v));
export const scale = (s: ZPhi, p: Point): Point => point(mul(s, p.u), mul(s, p.v));
export const samePoint = (p: Point, q: Point): boolean => eq(p.u, q.u) && eq(p.v, q.v);

/** Canonical string key; equal points always produce equal keys. */
export const pointKey = (p: Point): string => `${p.u.a},${p.u.b},${p.v.a},${p.v.b}`;

/** Sign of the cross product p × q (positive when q is counter-clockwise of p). */
export const crossSign = (p: Point, q: Point): -1 | 0 | 1 => sign(sub(mul(p.u, q.v), mul(p.v, q.u)));

/** Sign of (b − a) × (c − a): +1 when a, b, c turn counter-clockwise. */
export const orient = (a: Point, b: Point, c: Point): -1 | 0 | 1 => crossSign(minus(b, a), minus(c, a));

/** True when p lies strictly between a and b on segment ab. */
export function strictlyInsideSegment(p: Point, a: Point, b: Point): boolean {
  if (orient(a, b, p) !== 0) return false;
  if (samePoint(p, a) || samePoint(p, b)) return false;
  // collinear: compare along whichever basis coordinate varies
  const along = eq(a.u, b.u) ? (q: Point) => q.v : (q: Point) => q.u;
  const s1 = sign(sub(along(p), along(a)));
  const s2 = sign(sub(along(b), along(p)));
  return s1 !== 0 && s1 === s2;
}

/** Floating-point Cartesian coordinates, for drawing and hit-testing only. */
export function toXY(p: Point): { x: number; y: number } {
  const u = toNumber(p.u);
  const v = toNumber(p.v);
  return { x: u + v * COS36 + 0, y: v * SIN36 + 0 };
}

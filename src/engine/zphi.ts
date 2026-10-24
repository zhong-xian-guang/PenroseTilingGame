/**
 * Exact arithmetic in ℤ[φ] = { a + bφ | a, b ∈ ℤ }, φ = (1 + √5) / 2.
 *
 * Every length, coordinate and cross product the rules engine compares lives in
 * this ring, so rule decisions never depend on floating point.
 * φ² = φ + 1 gives the multiplication rule below.
 */
import { PHI } from './real';

export interface ZPhi {
  readonly a: number;
  readonly b: number;
}

export { PHI };

export const zphi = (a: number, b = 0): ZPhi => ({ a, b });

export const Z0 = zphi(0);
export const Z1 = zphi(1);
export const ZPHI = zphi(0, 1);

export const add = (x: ZPhi, y: ZPhi): ZPhi => zphi(x.a + y.a, x.b + y.b);
export const sub = (x: ZPhi, y: ZPhi): ZPhi => zphi(x.a - y.a, x.b - y.b);
export const neg = (x: ZPhi): ZPhi => zphi(-x.a, -x.b);

/** (a + bφ)(c + dφ) = (ac + bd) + (ad + bc + bd)φ */
export const mul = (x: ZPhi, y: ZPhi): ZPhi =>
  zphi(x.a * y.a + x.b * y.b, x.a * y.b + x.b * y.a + x.b * y.b);

export const eq = (x: ZPhi, y: ZPhi): boolean => x.a === y.a && x.b === y.b;

/**
 * Exact sign of a + bφ. Writing 2(a + bφ) = p + q√5 with p = 2a + b, q = b:
 * if p and q agree in sign that is the answer, otherwise compare p² with 5q².
 */
export function sign(x: ZPhi): -1 | 0 | 1 {
  const p = 2 * x.a + x.b;
  const q = x.b;
  const sp = Math.sign(p);
  const sq = Math.sign(q);
  if (sp === 0 && sq === 0) return 0;
  if (sp >= 0 && sq >= 0) return 1;
  if (sp <= 0 && sq <= 0) return -1;
  // opposite signs: |p| vs √5|q|
  const d = p * p - 5 * q * q;
  if (!Number.isSafeInteger(p * p) || !Number.isSafeInteger(5 * q * q)) {
    throw new RangeError('ℤ[φ] coefficients too large for exact sign test');
  }
  return (Math.sign(d) * sp) as -1 | 0 | 1;
}

export const compare = (x: ZPhi, y: ZPhi): -1 | 0 | 1 => sign(sub(x, y));

export const toNumber = (x: ZPhi): number => x.a + x.b * PHI;

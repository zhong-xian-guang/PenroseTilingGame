/**
 * Floating-point constants and helpers of the engine, in one place.
 *
 * Wherever floats reach a rule decision (the growth circle, see ADR 0002),
 * they must come out bit-identical on every platform: only operations that
 * IEEE-754 specifies exactly (+, -, *, /, sqrt, comparisons) and constants
 * written as literals. Math.hypot, Math.sin, Math.atan2 etc. are
 * implementation-approximated in ECMAScript, so they never appear here.
 */

/** The golden ratio φ = (1 + √5) / 2. */
export const PHI = 1.618033988749895;
/** cos 36° = φ / 2. */
export const COS36 = PHI / 2;
/** sin 36° (correctly rounded). */
export const SIN36 = 0.5877852522924731;
/** sin 72° (correctly rounded). */
export const SIN72 = 0.9510565162951535;

/** Squared distance between two float points. */
export const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

/** Distance between two float points (sqrt of the squared distance; never Math.hypot). */
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.sqrt(dist2(a, b));

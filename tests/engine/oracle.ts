/**
 * Independent floating-point test oracle: plain Cartesian geometry, written
 * without reference to the engine's exact arithmetic, used to cross-check what
 * the engine reports.
 */
import { toXY, type Point } from '../../src/engine';

export interface XY {
  x: number;
  y: number;
}

export const polygonOf = (pts: readonly Point[]): XY[] => pts.map(toXY);

const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function area(poly: XY[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Split a simple counter-clockwise quadrilateral into two counter-clockwise triangles. */
function triangulate(q: XY[]): XY[][] {
  const [a, b, c, d] = q as [XY, XY, XY, XY];
  if (cross(a, b, c) > 0 && cross(a, c, d) > 0) return [[a, b, c], [a, c, d]];
  return [[b, c, d], [b, d, a]];
}

/** Sutherland–Hodgman clip of `subject` by convex counter-clockwise `clip`. */
function clipConvex(subject: XY[], clip: XY[]): XY[] {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!;
      const q = input[(j + 1) % input.length]!;
      const pin = cross(a, b, p) >= 0;
      const qin = cross(a, b, q) >= 0;
      if (pin) out.push(p);
      if (pin !== qin) {
        const t = cross(a, b, p) / (cross(a, b, p) - cross(a, b, q));
        out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
      }
    }
  }
  return out;
}

/** Area of the intersection of two simple quadrilaterals. */
export function overlapArea(p: XY[], q: XY[]): number {
  let s = 0;
  for (const t1 of triangulate(p)) for (const t2 of triangulate(q)) s += Math.abs(area(clipConvex(t1, t2)));
  return s;
}

const close = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;

/** How many edges of polygon `a` coincide exactly with an edge of polygon `b`. */
export function sharedEdgeCount(a: readonly Point[], b: readonly Point[]): number {
  const pa = polygonOf(a);
  const pb = polygonOf(b);
  let n = 0;
  for (let i = 0; i < pa.length; i++) {
    const a0 = pa[i]!;
    const a1 = pa[(i + 1) % pa.length]!;
    for (let j = 0; j < pb.length; j++) {
      const b0 = pb[j]!;
      const b1 = pb[(j + 1) % pb.length]!;
      if ((close(a0, b0) && close(a1, b1)) || (close(a0, b1) && close(a1, b0))) n++;
    }
  }
  return n;
}

/** True when some vertex of one polygon lies strictly inside an edge of the other. */
export function hasTJunction(a: readonly Point[], b: readonly Point[]): boolean {
  const pa = polygonOf(a);
  const pb = polygonOf(b);
  const inside = (p: XY, s: XY, t: XY) => {
    if (close(p, s) || close(p, t)) return false;
    const len = Math.hypot(t.x - s.x, t.y - s.y);
    if (Math.abs(cross(s, t, p)) / len > 1e-9) return false;
    const u = ((p.x - s.x) * (t.x - s.x) + (p.y - s.y) * (t.y - s.y)) / (len * len);
    return u > 0 && u < 1;
  };
  for (const [P, Q] of [
    [pa, pb],
    [pb, pa],
  ] as const) {
    for (const p of P) for (let i = 0; i < Q.length; i++) if (inside(p, Q[i]!, Q[(i + 1) % Q.length]!)) return true;
  }
  return false;
}

export const centroid = (poly: XY[]): XY => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
});

import { describe, expect, it } from 'vitest';
import { createGame, openingPatch, P2, pointKey, toXY, type PlacedTile } from '../../src/engine';
import { tileOutline } from '../../src/board/outline';

type XY = { x: number; y: number };

const outlineOf = (tile: { kind: string; vertices: readonly XY[] }) =>
  tileOutline(P2.shapes[tile.kind]!, tile.vertices);

/**
 * Where an outline crosses the normal of edge p→q at fraction `t` along it, as signed offsets from the
 * chord (positive to the left of p→q). Other edges of the tile may cross it too.
 */
function crossings(outline: readonly XY[], p: XY, q: XY, t: number): number[] {
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const ux = (q.x - p.x) / len;
  const uy = (q.y - p.y) / len;
  const along = (pt: XY) => (pt.x - p.x) * ux + (pt.y - p.y) * uy - t * len;
  const left = (pt: XY) => (pt.y - p.y) * ux - (pt.x - p.x) * uy;
  const out: number[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const sa = along(a);
    const sb = along(b);
    if (sa === sb || Math.sign(sa) === Math.sign(sb)) return;
    out.push(left(a) + (sa / (sa - sb)) * (left(b) - left(a)));
  });
  return out;
}

/** The offset where both outlines cross the normal at the same point off the chord, if there is one. */
const commonCrossing = (a: number[], b: number[]) =>
  a.find((x) => Math.abs(x) > 0.01 && b.some((y) => Math.abs(x - y) < 1e-9));

const FRACTIONS = [0.25, 0.5, 0.75];

const asXY = (t: PlacedTile) => ({ kind: t.kind, vertices: t.vertices.map(toXY) });

/** Every pair of tiles sharing an edge in some real tilings, with the shared edge (in the first tile's order). */
function sharedEdges() {
  const out: { a: ReturnType<typeof asXY>; b: ReturnType<typeof asXY>; p: XY; q: XY }[] = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const tiles = createGame({ opening: openingPatch(seed) }).confirmedTiles();
    for (const ta of tiles) {
      for (const tb of tiles) {
        if (ta.id >= tb.id) continue;
        const keys = new Set(tb.vertices.map(pointKey));
        ta.vertices.forEach((v, i) => {
          const w = ta.vertices[(i + 1) % ta.vertices.length]!;
          if (keys.has(pointKey(v)) && keys.has(pointKey(w))) {
            out.push({ a: asXY(ta), b: asXY(tb), p: toXY(v), q: toXY(w) });
          }
        });
      }
    }
  }
  return out;
}

describe('tileOutline', () => {
  it('makes two glued tiles meet along the whole shared edge', () => {
    const edges = sharedEdges();
    expect(edges.length).toBeGreaterThan(5);
    for (const { a, b, p, q } of edges) {
      const oa = outlineOf(a);
      const ob = outlineOf(b);
      for (const t of FRACTIONS) {
        expect(commonCrossing(crossings(oa, p, q, t), crossings(ob, p, q, t))).toBeDefined();
      }
    }
  });

  it('leaves a tile turned end for end on the same edge unable to fit', () => {
    for (const { a, b, p, q } of sharedEdges()) {
      // b mirrored in the edge's perpendicular bisector: the same kind on the same edge, ends swapped.
      // Mirroring flips the winding, so walk the corners backwards; both shapes are symmetric about corner 0.
      const len2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      const mirror = (v: XY): XY => {
        const k = (2 * ((v.x - (p.x + q.x) / 2) * (q.x - p.x) + (v.y - (p.y + q.y) / 2) * (q.y - p.y))) / len2;
        return { x: v.x - k * (q.x - p.x), y: v.y - k * (q.y - p.y) };
      };
      const [v0, v1, v2, v3] = b.vertices.map(mirror);
      const turned = { kind: b.kind, vertices: [v0!, v3!, v2!, v1!] };
      const oa = outlineOf(a);
      const ot = outlineOf(turned);
      expect(commonCrossing(crossings(oa, p, q, 0.5), crossings(ot, p, q, 0.5))).toBeUndefined();
    }
  });

  it('passes through every corner of the tile', () => {
    for (const { a } of sharedEdges()) {
      const outline = outlineOf(a);
      for (const v of a.vertices) expect(outline).toContainEqual(v);
    }
  });
});

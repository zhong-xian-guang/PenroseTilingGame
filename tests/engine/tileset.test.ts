import { describe, expect, it } from 'vitest';
import { createGame, ORIGIN, P2, PHI, toXY, type PlacedTile } from '../../src/engine';

function measure(tile: PlacedTile) {
  const pts = tile.vertices.map(toXY);
  const n = pts.length;
  const edges = pts.map((p, i) => {
    const q = pts[(i + 1) % n]!;
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
  // interior angle at each corner of a counter-clockwise polygon, in degrees
  const angles = pts.map((p, i) => {
    const prev = pts[(i + n - 1) % n]!;
    const next = pts[(i + 1) % n]!;
    const aOut = Math.atan2(next.y - p.y, next.x - p.x);
    const aIn = Math.atan2(prev.y - p.y, prev.x - p.x);
    let d = ((aIn - aOut) * 180) / Math.PI;
    while (d <= 0) d += 360;
    return Math.round(d * 1e6) / 1e6;
  });
  return { edges, angles };
}

const single = (kind: string, dir = 0) =>
  createGame({ opening: [{ kind, origin: ORIGIN, dir }] }).tiles()[0]!;

describe('P2 tile set', () => {
  it('offers exactly kite and dart', () => {
    expect([...P2.kinds].sort()).toEqual(['dart', 'kite']);
  });

  it.each([0, 3, 7])('kite (dir %i) has edges φ,1,1,φ and angles 72,72,144,72', (dir) => {
    const { edges, angles } = measure(single('kite', dir));
    expect(edges[0]).toBeCloseTo(PHI, 9);
    expect(edges[1]).toBeCloseTo(1, 9);
    expect(edges[2]).toBeCloseTo(1, 9);
    expect(edges[3]).toBeCloseTo(PHI, 9);
    expect(angles).toEqual([72, 72, 144, 72]);
  });

  it.each([0, 4, 9])('dart (dir %i) has edges φ,1,1,φ and angles 72,36,216,36', (dir) => {
    const { edges, angles } = measure(single('dart', dir));
    expect(edges[0]).toBeCloseTo(PHI, 9);
    expect(edges[1]).toBeCloseTo(1, 9);
    expect(edges[2]).toBeCloseTo(1, 9);
    expect(edges[3]).toBeCloseTo(PHI, 9);
    expect(angles).toEqual([72, 36, 216, 36]);
  });

  it('declares corner angles that agree with the geometry', () => {
    for (const kind of P2.kinds) {
      const { angles } = measure(single(kind));
      expect(P2.shapes[kind]!.corners.map((c) => c.angle * 36)).toEqual(angles);
    }
  });

  it('kite area / dart area = φ, kite area ≈ 1.539, dart area ≈ 0.951', () => {
    expect(P2.shapes.kite!.area).toBeCloseTo(1.5388, 4);
    expect(P2.shapes.dart!.area).toBeCloseTo(0.9511, 4);
    expect(P2.shapes.kite!.area / P2.shapes.dart!.area).toBeCloseTo(PHI, 12);
  });
});

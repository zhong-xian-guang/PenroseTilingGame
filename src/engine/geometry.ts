/** Exact tile geometry: placing a tile shape at (origin, dir). */
import { minus, mod10, plus, scale, unit, type Point } from './point';
import { shapeOf, type TileKind, type TileSet } from './tileset';

/** Where a tile goes: corner 0 at `origin`, rotated by `dir`·36°. */
export interface Placement {
  readonly kind: TileKind;
  readonly origin: Point;
  readonly dir: number;
}

/** Exact corner positions of a placed tile, counter-clockwise. */
export function placementVertices(tileSet: TileSet, p: Placement): Point[] {
  const shape = shapeOf(tileSet, p.kind);
  const out: Point[] = [];
  let at = p.origin;
  for (const edge of shape.edges) {
    out.push(at);
    at = plus(at, scale(edge.length, unit(p.dir + edge.turn)));
  }
  return out;
}

/** Absolute direction (0–9) of edge `i` of a placement. */
export const edgeDirection = (tileSet: TileSet, p: Placement, i: number): number =>
  mod10(p.dir + shapeOf(tileSet, p.kind).edges[i]!.turn);

/**
 * The placement of `kind` whose edge `j` is glued onto the segment from → to
 * (i.e. its corner j sits on `from`, corner j+1 on `to`), where the segment
 * points along direction `segmentDir`.
 */
export function placementOnSegment(
  tileSet: TileSet,
  kind: TileKind,
  j: number,
  from: Point,
  segmentDir: number,
): Placement {
  const shape = shapeOf(tileSet, kind);
  const dir = mod10(segmentDir - shape.edges[j]!.turn);
  let origin = from;
  for (let k = 0; k < j; k++) {
    const e = shape.edges[k]!;
    origin = minus(origin, scale(e.length, unit(dir + e.turn)));
  }
  return { kind, origin, dir };
}

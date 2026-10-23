/**
 * Tile-set abstraction. A tile set (P2 kite/dart today, P3 rhombs later) is pure
 * data plus a couple of tiny predicates; the rules engine is generic over it.
 *
 * Geometry convention: a tile is placed by (kind, origin, dir). `origin` is the
 * exact position of corner 0, `dir` (0–9) is the tile's rotation in steps of
 * 36°. Corners are listed counter-clockwise; edge i runs from corner i to
 * corner i+1 along unit direction `dir + edges[i].turn` with exact length
 * `edges[i].length`.
 */
import type { ZPhi } from './zphi';

export type TileKind = string;

export interface CornerSpec {
  /** Interior angle in units of 36° (so a full turn is 10). */
  readonly angle: number;
  /** Matching-rule vertex label; see `TileSet.cornersMatch`. */
  readonly label: string;
}

export interface EdgeSpec {
  /** Direction of the edge relative to the tile's `dir`, in 36° steps. */
  readonly turn: number;
  readonly length: ZPhi;
  /** Matching-rule edge label; see `TileSet.edgesMatch`. */
  readonly label: string;
}

/** A Conway-style decoration arc, for drawing only. */
export interface ArcSpec {
  readonly corner: number;
  /** Radius in length units (floating point: drawing only). */
  readonly radius: number;
  /** Which of the two arc families the arc belongs to (they get different colours). */
  readonly family: 'A' | 'B';
}

export interface TileShape {
  readonly kind: TileKind;
  readonly corners: readonly CornerSpec[];
  readonly edges: readonly EdgeSpec[];
  /** Triangulation by corner index (counter-clockwise), used for exact overlap tests. */
  readonly triangles: readonly (readonly [number, number, number])[];
  /** Area in squared length units (floating point: scoring display). */
  readonly area: number;
  readonly arcs: readonly ArcSpec[];
}

/** One corner of one tile kind. */
export interface CornerRef {
  readonly kind: TileKind;
  readonly corner: number;
}

/** A complete arrangement of corners around one vertex, listed counter-clockwise. */
export interface VertexConfiguration {
  readonly name: string;
  readonly corners: readonly CornerRef[];
}

export interface TileSet {
  readonly id: string;
  readonly kinds: readonly TileKind[];
  readonly shapes: Readonly<Record<TileKind, TileShape>>;
  /** Every legal complete vertex arrangement (the vertex atlas). */
  readonly vertexAtlas: readonly VertexConfiguration[];
  /** May two corners with these labels sit on the same point? */
  cornersMatch(a: string, b: string): boolean;
  /** May two tile edges with these labels be glued together? */
  edgesMatch(a: string, b: string): boolean;
}

export function shapeOf(tileSet: TileSet, kind: TileKind): TileShape {
  const shape = tileSet.shapes[kind];
  if (!shape) throw new Error(`Tile set ${tileSet.id} has no tile kind "${kind}"`);
  return shape;
}

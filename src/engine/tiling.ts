/**
 * Internal tiling structure: tiles plus vertex and edge incidence, and the
 * exact legality test for new placements. Not exported from the engine; the
 * Game wraps it.
 *
 * Every rule decision here uses exact ℤ[φ] arithmetic. Floating point appears
 * only as a coarse culling radius (tiles whose centroids are more than
 * NEAR_RADIUS apart cannot touch: a P2 tile's diameter is φ < 2), which can
 * only widen the set of tiles that get the exact test.
 */
import { edgeDirection, placementOnSegment, placementVertices, type Placement } from './geometry';
import { mod10, orient, pointKey, strictlyInsideSegment, toXY, type Point } from './point';
import { shapeOf, type TileKind, type TileSet } from './tileset';
import { eq } from './zphi';

const NEAR_RADIUS = 4;

export interface TileRecord {
  readonly id: number;
  readonly placement: Placement;
  readonly vertices: readonly Point[];
  readonly keys: readonly string[];
  readonly center: { x: number; y: number };
}

export interface CornerAt {
  readonly tileId: number;
  readonly corner: number;
}

interface VertexRecord {
  readonly point: Point;
  readonly label: string;
  readonly corners: CornerAt[];
}

interface EdgeOwner {
  readonly tileId: number;
  readonly edge: number;
}

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const placementKey = (p: Placement): string => `${p.kind}@${pointKey(p.origin)}/${mod10(p.dir)}`;

/** Floating-point centre of a polygon (culling and presentation order only). */
export function centerOf(vertices: readonly Point[]) {
  let x = 0;
  let y = 0;
  for (const v of vertices) {
    const q = toXY(v);
    x += q.x;
    y += q.y;
  }
  return { x: x / vertices.length, y: y / vertices.length };
}

export class Tiling {
  private readonly records: TileRecord[] = [];
  private readonly vertexMap = new Map<string, VertexRecord>();
  private readonly edgeMap = new Map<string, EdgeOwner[]>();
  private candidateCache = new Map<TileKind, Placement[]>();

  constructor(readonly tileSet: TileSet) {}

  get tiles(): readonly TileRecord[] {
    return this.records;
  }

  vertex(key: string): VertexRecord | undefined {
    return this.vertexMap.get(key);
  }

  /** Adds a tile without checking legality (used for trusted openings and after `isLegal`). */
  add(placement: Placement): TileRecord {
    const vertices = placementVertices(this.tileSet, placement);
    const keys = vertices.map(pointKey);
    const shape = shapeOf(this.tileSet, placement.kind);
    const rec: TileRecord = {
      id: this.records.length,
      placement: { kind: placement.kind, origin: placement.origin, dir: mod10(placement.dir) },
      vertices,
      keys,
      center: centerOf(vertices),
    };
    this.records.push(rec);
    keys.forEach((k, i) => {
      let v = this.vertexMap.get(k);
      if (!v) {
        v = { point: vertices[i]!, label: shape.corners[i]!.label, corners: [] };
        this.vertexMap.set(k, v);
      }
      v.corners.push({ tileId: rec.id, corner: i });
    });
    keys.forEach((k, i) => {
      const ek = edgeKey(k, keys[(i + 1) % keys.length]!);
      const list = this.edgeMap.get(ek) ?? [];
      list.push({ tileId: rec.id, edge: i });
      this.edgeMap.set(ek, list);
    });
    this.candidateCache = new Map();
    return rec;
  }

  /** Takes the most recently added tile off again, undoing exactly what `add` recorded. */
  removeLast(): TileRecord | undefined {
    const rec = this.records.pop();
    if (!rec) return undefined;
    const { keys } = rec;
    keys.forEach((k) => {
      const v = this.vertexMap.get(k)!;
      v.corners.pop();
      if (v.corners.length === 0) this.vertexMap.delete(k);
    });
    keys.forEach((k, i) => {
      const ek = edgeKey(k, keys[(i + 1) % keys.length]!);
      const list = this.edgeMap.get(ek)!;
      list.pop();
      if (list.length === 0) this.edgeMap.delete(ek);
    });
    this.candidateCache = new Map();
    return rec;
  }

  /**
   * A placement is legal when it shares at least one whole edge with the
   * tiling, every corner agrees with the matching-rule label already on its
   * point, every glued edge matches, it does not overlap any tile, and no
   * vertex of either lies in the interior of the other's edge (edge-to-edge).
   */
  isLegal(placement: Placement): boolean {
    const ts = this.tileSet;
    const shape = shapeOf(ts, placement.kind);
    const vertices = placementVertices(ts, placement);
    const keys = vertices.map(pointKey);
    const n = keys.length;

    for (let i = 0; i < n; i++) {
      const v = this.vertexMap.get(keys[i]!);
      if (v && !ts.cornersMatch(v.label, shape.corners[i]!.label)) return false;
    }

    let shares = false;
    for (let i = 0; i < n; i++) {
      const a = keys[i]!;
      const b = keys[(i + 1) % n]!;
      const owners = this.edgeMap.get(edgeKey(a, b));
      if (!owners) continue;
      if (owners.length !== 1) return false;
      const other = this.records[owners[0]!.tileId]!;
      const oe = owners[0]!.edge;
      // glued edges run in opposite directions (tiles on opposite sides)
      if (other.keys[oe] !== b) return false;
      const otherEdge = shapeOf(ts, other.placement.kind).edges[oe]!;
      const ownEdge = shape.edges[i]!;
      if (!eq(otherEdge.length, ownEdge.length) || !ts.edgesMatch(otherEdge.label, ownEdge.label)) return false;
      shares = true;
    }
    if (!shares) return false;

    const center = centerOf(vertices);
    const ownTris = shape.triangles.map((t) => t.map((i) => vertices[i]!));
    for (const other of this.records) {
      if (Math.hypot(other.center.x - center.x, other.center.y - center.y) > NEAR_RADIUS) continue;
      const otherShape = shapeOf(ts, other.placement.kind);
      const otherTris = otherShape.triangles.map((t) => t.map((i) => other.vertices[i]!));
      for (const t1 of ownTris) for (const t2 of otherTris) if (trianglesOverlap(t1, t2)) return false;
      if (hasTJunction(vertices, other.vertices)) return false;
    }
    return true;
  }

  /** Every boundary edge as (tile, edge index). A boundary edge belongs to exactly one tile. */
  *boundaryEdges(): Generator<EdgeOwner> {
    for (const owners of this.edgeMap.values()) if (owners.length === 1) yield owners[0]!;
  }

  /** All legal placements of `kind` (each shares at least one whole edge with the tiling). */
  candidates(kind: TileKind): readonly Placement[] {
    const cached = this.candidateCache.get(kind);
    if (cached) return cached;
    const ts = this.tileSet;
    const shape = shapeOf(ts, kind);
    const seen = new Set<string>();
    const out: Placement[] = [];
    for (const { tileId, edge } of this.boundaryEdges()) {
      const owner = this.records[tileId]!;
      const ownerEdge = shapeOf(ts, owner.placement.kind).edges[edge]!;
      const to = owner.vertices[(edge + 1) % owner.vertices.length]!;
      const reverseDir = edgeDirection(ts, owner.placement, edge) + 5;
      shape.edges.forEach((e, j) => {
        if (!eq(e.length, ownerEdge.length) || !ts.edgesMatch(e.label, ownerEdge.label)) return;
        const p = placementOnSegment(ts, kind, j, to, reverseDir);
        const key = placementKey(p);
        if (seen.has(key)) return;
        seen.add(key);
        if (this.isLegal(p)) out.push(p);
      });
    }
    this.candidateCache.set(kind, out);
    return out;
  }
}

/** Exact separating-axis test: do the interiors of two counter-clockwise triangles intersect? */
function trianglesOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  return !separatedByEdge(a, b) && !separatedByEdge(b, a);
}

function separatedByEdge(a: readonly Point[], b: readonly Point[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = a[(i + 1) % a.length]!;
    if (b.every((r) => orient(p, q, r) <= 0)) return true;
  }
  return false;
}

function hasTJunction(a: readonly Point[], b: readonly Point[]): boolean {
  const check = (pts: readonly Point[], poly: readonly Point[]) =>
    pts.some((p) => poly.some((s, i) => strictlyInsideSegment(p, s, poly[(i + 1) % poly.length]!)));
  return check(a, b) || check(b, a);
}

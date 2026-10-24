/**
 * Internal tiling structure: tiles plus vertex and edge incidence, and the
 * exact legality test for new placements. Not exported from the engine; the
 * Game wraps it.
 *
 * Every rule decision here uses exact ℤ[φ] arithmetic. Floating point appears
 * only in conservative culling, which can only widen the set of tiles that
 * get the exact test: tiles whose centres are more than NEAR_RADIUS apart
 * cannot touch (a P2 tile's diameter is φ < 2), nor can tiles whose bounding
 * boxes are more than BOX_SLACK apart (float error on realistic boards is
 * many orders of magnitude below BOX_SLACK).
 *
 * Performance (thousands of tiles): tiles are bucketed in a uniform grid of
 * NEAR_RADIUS-sized cells, so the overlap test only looks at the 3x3 cells
 * around a placement. The legal placements glued onto each boundary edge are
 * cached per edge, and a change only touches the entries of edges within
 * INVALIDATE_RADIUS of the changed tile: a tile can only change the legality
 * of placements it touches. Adding a tile can only make placements illegal
 * (every check in `isLegal` gets stricter), so after `add` only the cached
 * legal placements nearby are re-checked; after `removeLast` the nearby
 * entries are rebuilt. `candidates` and `deadEdges` are assembled from the
 * cache, in the same order a full scan would give.
 */
import { edgeDirection, placementOnSegment, placementVertices, type Placement } from './geometry';
import { mod10, orient, pointKey, strictlyInsideSegment, toXY, type Point } from './point';
import { dist, dist2 } from './real';
import { shapeOf, type TileKind, type TileSet } from './tileset';
import { eq } from './zphi';

const NEAR_RADIUS = 4;
const BOX_SLACK = 1e-6;
/**
 * Cached boundary edges whose midpoint is this close to an added/removed
 * tile's centre are re-checked. Every point of a P2 tile lies within 1.06 of
 * its centre (vertex average), so a tile touching a placement glued onto an
 * edge has its centre within 1.06 + 2 · 1.06 < 3.2 of that edge's midpoint.
 */
const INVALIDATE_RADIUS = 3.5;

/** Grid cell (side NEAR_RADIUS) as one number. */
const cellOf = (ix: number, iy: number): number => (ix + 0x8000) * 0x10000 + (iy + 0x8000);

/** A legal placement glued onto a boundary edge. */
interface LegalOption {
  readonly placement: Placement;
  /** Edge keys of every boundary edge it is glued onto (more than one when it fills a notch). */
  readonly glued: readonly string[];
}

/** What can be glued onto one boundary edge: the legal placements per tile kind, in tile-edge order. */
interface EdgeEntry {
  readonly mid: { x: number; y: number };
  readonly legal: ReadonlyMap<TileKind, readonly LegalOption[]>;
}

export interface TileRecord {
  readonly id: number;
  readonly placement: Placement;
  readonly vertices: readonly Point[];
  readonly keys: readonly string[];
  readonly center: { x: number; y: number };
  /** Floating-point bounding box (culling only). */
  readonly box: Box;
  /** Floating-point corner positions (culling only). */
  readonly xy: readonly XY[];
}

interface XY {
  readonly x: number;
  readonly y: number;
}

interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function boxOf(vertices: readonly Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    const { x, y } = toXY(v);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Are two boxes clearly apart (by more than BOX_SLACK)? Then the tiles in them cannot touch. */
const boxesApart = (a: Box, b: Box): boolean =>
  a.minX > b.maxX + BOX_SLACK ||
  b.minX > a.maxX + BOX_SLACK ||
  a.minY > b.maxY + BOX_SLACK ||
  b.minY > a.maxY + BOX_SLACK;

export interface CornerAt {
  readonly tileId: number;
  readonly corner: number;
}

interface VertexRecord {
  readonly point: Point;
  readonly label: string;
  readonly corners: CornerAt[];
}

export interface EdgeOwner {
  readonly tileId: number;
  readonly edge: number;
}

/** A disc in floating-point world coordinates (the growth circle). */
export interface Disc {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * Does the segment a–b come within the disc (distance from the centre ≤ r)?
 * A rule decision computed in floating point, so only with IEEE-754-exact
 * operations (no Math.hypot), comparing squared distances: bit-identical on
 * every platform (ADR 0002).
 */
function segmentReachesDisc(a: Point, b: Point, d: Disc): boolean {
  const p = toXY(a);
  const q = toXY(b);
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const t = Math.max(0, Math.min(1, ((d.x - p.x) * dx + (d.y - p.y) * dy) / (dx * dx + dy * dy)));
  return d.r >= 0 && dist2({ x: p.x + t * dx, y: p.y + t * dy }, d) <= d.r * d.r;
}

/** Canonical key of the edge between two point keys (either order). */
export const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

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
  /**
   * The boundary edges (one owner), kept in the edge map's order (order of
   * first appearance), so candidates come out in the same order a scan of the
   * edge map would give. `edgeSeq` numbers edges by first appearance; an edge
   * uncovered again by `removeLast` is re-sorted into place lazily.
   */
  private boundary = new Map<string, EdgeOwner>();
  private boundaryUnordered = false;
  private readonly edgeSeq = new Map<string, number>();
  private nextEdgeSeq = 0;
  private candidateCache = new Map<TileKind, Placement[]>();
  /** Tile ids by the grid cell of their centre (see cellOf). */
  private readonly grid = new Map<number, number[]>();
  /** Per boundary edge (by edge key): the placements that could go there. Invalidated locally. */
  private readonly edgeCache = new Map<string, EdgeEntry>();
  /** Only boundary edges reaching into this disc take new tiles (null = no restriction). */
  private region: Disc | null = null;

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
      box: boxOf(vertices),
      xy: vertices.map(toXY),
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
      let list = this.edgeMap.get(ek);
      if (!list) {
        list = [];
        this.edgeMap.set(ek, list);
        this.edgeSeq.set(ek, this.nextEdgeSeq++);
      }
      list.push({ tileId: rec.id, edge: i });
      if (list.length === 1) this.boundary.set(ek, list[0]!);
      else this.boundary.delete(ek);
    });
    const cell = this.cellKey(rec.center);
    const bucket = this.grid.get(cell);
    if (bucket) bucket.push(rec.id);
    else this.grid.set(cell, [rec.id]);
    this.changedNear(rec, true);
    return rec;
  }

  private cellKey(p: { x: number; y: number }): number {
    return cellOf(Math.floor(p.x / NEAR_RADIUS), Math.floor(p.y / NEAR_RADIUS));
  }

  /**
   * A tile was added or removed: bring the cached entries near it up to date.
   * After an add, the legal placements nearby are re-checked (none can have
   * become legal); after a removal, nearby entries are dropped and rebuilt
   * on demand.
   */
  private changedNear(rec: TileRecord, added: boolean): void {
    this.candidateCache = new Map();
    for (const [ek, entry] of this.edgeCache) {
      if (dist2(entry.mid, rec.center) > INVALIDATE_RADIUS * INVALIDATE_RADIUS) continue;
      if (!added || !this.boundary.has(ek)) {
        this.edgeCache.delete(ek);
        continue;
      }
      const legal = new Map<TileKind, LegalOption[]>();
      for (const [kind, options] of entry.legal) {
        const still: LegalOption[] = [];
        for (const o of options) if (this.isLegal(o.placement)) still.push(this.legalOption(o.placement));
        legal.set(kind, still);
      }
      this.edgeCache.set(ek, { mid: entry.mid, legal });
    }
  }

  /** Every tile whose centre is within NEAR_RADIUS of `c` (and some a little farther). */
  private *tilesNear(c: { x: number; y: number }): Generator<TileRecord> {
    const ix = Math.floor(c.x / NEAR_RADIUS);
    const iy = Math.floor(c.y / NEAR_RADIUS);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.grid.get(cellOf(ix + dx, iy + dy));
        if (bucket) for (const id of bucket) yield this.records[id]!;
      }
    }
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
      if (list.length === 0) {
        this.edgeMap.delete(ek);
        this.edgeSeq.delete(ek);
        this.boundary.delete(ek);
      } else if (list.length === 1) {
        this.boundary.set(ek, list[0]!);
        this.boundaryUnordered = true;
      }
    });
    const cell = this.cellKey(rec.center);
    const bucket = this.grid.get(cell)!;
    bucket.pop(); // the newest tile is the last one in its cell
    if (bucket.length === 0) this.grid.delete(cell);
    this.changedNear(rec, false);
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
    const box = boxOf(vertices);
    const xy = vertices.map(toXY);
    for (const other of this.tilesNear(center)) {
      if (dist2(other.center, center) > NEAR_RADIUS * NEAR_RADIUS) continue;
      if (boxesApart(box, other.box)) continue;
      const otherShape = shapeOf(ts, other.placement.kind);
      for (const t1 of shape.triangles) {
        for (const t2 of otherShape.triangles) {
          if (trianglesOverlap(t1, vertices, xy, t2, other.vertices, other.xy)) return false;
        }
      }
      if (hasTJunction(vertices, xy, other.vertices, other.xy)) return false;
    }
    return true;
  }

  /**
   * Restrict growth to the boundary edges that reach into `disc` (null lifts
   * the restriction). `candidates` and `deadEdges` look only at those edges;
   * `isLegal` stays a pure matching/overlap test.
   */
  setRegion(disc: Disc | null): void {
    const r = this.region;
    if (r === disc || (r && disc && r.x === disc.x && r.y === disc.y && r.r === disc.r)) return;
    this.region = disc;
    this.candidateCache = new Map();
  }

  private inRegion(from: Point, to: Point): boolean {
    return this.region === null || segmentReachesDisc(from, to, this.region);
  }

  /** Is `placement` glued onto at least one boundary edge inside the growth region? */
  gluedInRegion(placement: Placement): boolean {
    const vertices = placementVertices(this.tileSet, placement);
    const keys = vertices.map(pointKey);
    return keys.some((a, i) => {
      const j = (i + 1) % keys.length;
      const owners = this.edgeMap.get(edgeKey(a, keys[j]!));
      return owners?.length === 1 && this.inRegion(vertices[i]!, vertices[j]!);
    });
  }

  /** Every boundary edge as (edge key, tile, edge index). A boundary edge belongs to exactly one tile. */
  *boundaryEdges(): Generator<{ ek: string; tileId: number; edge: number }> {
    if (this.boundaryUnordered) {
      const seq = (ek: string) => this.edgeSeq.get(ek)!;
      this.boundary = new Map([...this.boundary].sort(([a], [b]) => seq(a) - seq(b)));
      this.boundaryUnordered = false;
    }
    for (const [ek, owner] of this.boundary) yield { ek, ...owner };
  }

  /** Is boundary edge `edge` of tile `tileId` inside the growth region? */
  private edgeInRegion(tileId: number, edge: number): boolean {
    const vs = this.records[tileId]!.vertices;
    return this.inRegion(vs[edge]!, vs[(edge + 1) % vs.length]!);
  }

  /** A placement known to be legal, with the boundary edges it is glued onto (all its edges already in the tiling). */
  private legalOption(placement: Placement): LegalOption {
    const keys = placementVertices(this.tileSet, placement).map(pointKey);
    const glued: string[] = [];
    keys.forEach((a, i) => {
      const ek = edgeKey(a, keys[(i + 1) % keys.length]!);
      if (this.edgeMap.has(ek)) glued.push(ek);
    });
    return { placement, glued };
  }

  /** The (cached) legal placements glued onto boundary edge `edge` of tile `tileId`. */
  private edgeEntry(ek: string, tileId: number, edge: number): EdgeEntry {
    const cached = this.edgeCache.get(ek);
    if (cached) return cached;
    const ts = this.tileSet;
    const owner = this.records[tileId]!;
    const ownerEdge = shapeOf(ts, owner.placement.kind).edges[edge]!;
    const from = owner.vertices[edge]!;
    const to = owner.vertices[(edge + 1) % owner.vertices.length]!;
    const reverseDir = edgeDirection(ts, owner.placement, edge) + 5;
    const legal = new Map<TileKind, LegalOption[]>();
    for (const kind of ts.kinds) {
      const options: LegalOption[] = [];
      shapeOf(ts, kind).edges.forEach((e, j) => {
        if (!eq(e.length, ownerEdge.length) || !ts.edgesMatch(e.label, ownerEdge.label)) return;
        const placement = placementOnSegment(ts, kind, j, to, reverseDir);
        if (this.isLegal(placement)) options.push(this.legalOption(placement));
      });
      legal.set(kind, options);
    }
    const a = toXY(from);
    const b = toXY(to);
    const entry: EdgeEntry = { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, legal };
    this.edgeCache.set(ek, entry);
    return entry;
  }

  /**
   * Boundary edges that no tile of any kind, in any orientation, can be
   * legally glued onto. Legality only gets stricter as tiles are added, so
   * such an edge can never be covered: a visible dead end. Only edges inside
   * the growth region are looked at.
   */
  deadEdges(): { from: Point; to: Point }[] {
    const out: { from: Point; to: Point }[] = [];
    for (const { ek, tileId, edge } of this.boundaryEdges()) {
      if (!this.edgeInRegion(tileId, edge)) continue;
      const { legal } = this.edgeEntry(ek, tileId, edge);
      if ([...legal.values()].some((options) => options.length > 0)) continue;
      const vs = this.records[tileId]!.vertices;
      out.push({ from: vs[edge]!, to: vs[(edge + 1) % vs.length]! });
    }
    return out;
  }

  /**
   * The legal placements (any kind, any orientation) glued onto boundary edge
   * `edge` of tile `tileId`, ignoring the growth region; stops after `limit`.
   * Served from the per-edge cache.
   */
  fillers({ tileId, edge }: EdgeOwner, limit = Infinity): Placement[] {
    const keys = this.records[tileId]!.keys;
    const ek = edgeKey(keys[edge]!, keys[(edge + 1) % keys.length]!);
    const out: Placement[] = [];
    const seen = new Set<string>();
    for (const options of this.edgeEntry(ek, tileId, edge).legal.values()) {
      for (const o of options) {
        if (out.length >= limit) return out;
        const key = placementKey(o.placement);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(o.placement);
      }
    }
    return out;
  }

  /**
   * All legal placements of `kind` glued onto a boundary edge inside the
   * growth region, each once: a placement glued onto several boundary edges
   * is listed at the first of them (in boundary order) inside the region.
   */
  candidates(kind: TileKind): readonly Placement[] {
    const cached = this.candidateCache.get(kind);
    if (cached) return cached;
    const out: Placement[] = [];
    for (const { ek, tileId, edge } of this.boundaryEdges()) {
      if (!this.edgeInRegion(tileId, edge)) continue;
      for (const o of this.edgeEntry(ek, tileId, edge).legal.get(kind) ?? []) {
        if (o.glued.length > 1 && !this.listedHere(o, ek)) continue;
        out.push(o.placement);
      }
    }
    this.candidateCache.set(kind, out);
    return out;
  }

  /** Is `ek` the first (in boundary order) of the boundary edges `o` is glued onto that lie inside the region? */
  private listedHere(o: LegalOption, ek: string): boolean {
    const seq = this.edgeSeq.get(ek)!;
    return o.glued.every((g) => {
      if (g === ek || this.edgeSeq.get(g)! > seq) return true;
      const owner = this.boundary.get(g)!;
      return !this.edgeInRegion(owner.tileId, owner.edge);
    });
  }
}

/**
 * Float margin for the pre-checks below. Coordinates of realistic boards are
 * at most a few hundred with float error around 1e-13, so a float result
 * this far from zero has the same sign as the exact one; anything closer
 * goes to the exact test.
 */
const FLOAT_MARGIN = 1e-6;

/** (q − p) × (r − p) in floating point. */
const crossXY = (p: XY, q: XY, r: XY): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

/**
 * Exact separating-axis test: do the interiors of two counter-clockwise
 * triangles intersect? Triangles are given as corner indices into exact and
 * float corner lists; a clear float separation skips the exact test.
 */
function trianglesOverlap(
  ta: readonly number[],
  va: readonly Point[],
  xa: readonly XY[],
  tb: readonly number[],
  vb: readonly Point[],
  xb: readonly XY[],
): boolean {
  if (clearlySeparated(ta, xa, tb, xb) || clearlySeparated(tb, xb, ta, xa)) return false;
  const a = ta.map((i) => va[i]!);
  const b = tb.map((i) => vb[i]!);
  return !separatedByEdge(a, b) && !separatedByEdge(b, a);
}

/** Does an edge of triangle `ta` have all of `tb` clearly on its outer side (float, with margin)? */
function clearlySeparated(ta: readonly number[], xa: readonly XY[], tb: readonly number[], xb: readonly XY[]): boolean {
  for (let i = 0; i < ta.length; i++) {
    const p = xa[ta[i]!]!;
    const q = xa[ta[(i + 1) % ta.length]!]!;
    const len = dist(p, q);
    if (tb.every((k) => crossXY(p, q, xb[k]!) < -FLOAT_MARGIN * len)) return true;
  }
  return false;
}

function separatedByEdge(a: readonly Point[], b: readonly Point[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = a[(i + 1) % a.length]!;
    if (b.every((r) => orient(p, q, r) <= 0)) return true;
  }
  return false;
}

/** Does a corner of either polygon lie strictly inside an edge of the other? Exact, after a float pre-check. */
function hasTJunction(a: readonly Point[], xa: readonly XY[], b: readonly Point[], xb: readonly XY[]): boolean {
  const check = (pts: readonly Point[], xp: readonly XY[], poly: readonly Point[], xq: readonly XY[]) =>
    pts.some((p, k) =>
      poly.some((s, i) => {
        const j = (i + 1) % poly.length;
        if (clearlyOffSegment(xp[k]!, xq[i]!, xq[j]!)) return false;
        return strictlyInsideSegment(p, s, poly[j]!);
      }),
    );
  return check(a, xa, b, xb) || check(b, xb, a, xa);
}

/** Is `p` clearly (float, with margin) off segment a–b: away from its line, or beyond an end? */
function clearlyOffSegment(p: XY, a: XY, b: XY): boolean {
  const len = dist(a, b);
  if (Math.abs(crossXY(a, b, p)) > FLOAT_MARGIN * len) return true;
  const t = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  return t < -FLOAT_MARGIN * len || t > len * len + FLOAT_MARGIN * len;
}

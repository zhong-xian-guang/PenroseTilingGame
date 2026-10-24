/**
 * Post-game analysis (ticket 09): statistics of a game, computed from its
 * record by replaying it through the engine. These are presentation numbers:
 * floats are fine here, nothing feeds back into the rules.
 *
 * Shape completeness, with A the area and c the area centroid of the confirmed tiling:
 * - complete radius: radius of the largest disc around c that the tiling covers
 *   (distance from c to the nearest boundary edge, holes included; 0 when c is not covered);
 * - roundness: share of the equal-area disc (radius √(A/π), centred at c) that the
 *   tiling covers; 1 only for a perfect disc.
 */
import { replayWith, type DeadEnd, type Game, type GameStatus, type PlacedTile, type Score } from './game';
import { pointKey, toXY } from './point';
import type { GameRecord, PlayMode } from './record';
import { shapeOf } from './tileset';

export interface GameStats {
  /** Tiles in the final confirmed tiling (the pending tile and the game-ending tile do not count). */
  readonly tiles: number;
  /** Total area in squared length units. */
  readonly area: number;
  readonly kites: number;
  readonly darts: number;
  /** kites / darts (ideal for an infinite P2 tiling: φ), or null without darts. */
  readonly kiteDartRatio: number | null;
  /** Area centroid of the confirmed tiling, in world coordinates. */
  readonly centroid: { readonly x: number; readonly y: number };
  /** Radius of the largest disc around the centroid fully covered by tiles. */
  readonly completeRadius: number;
  /** √(area / π): radius of the disc with the same area. */
  readonly equalAreaRadius: number;
  /** Share (0–1) of the equal-area disc around the centroid that the tiling covers. */
  readonly roundness: number;
  /**
   * How many of the confirmed tiles the player placed in each mode (opening,
   * removed, pending and game-ending tiles excluded; a step without a mode
   * counts as free).
   */
  readonly modes: { readonly free: number; readonly flow: number };
}

/**
 * A frozen position of a replay: the read-only queries a board renderer
 * needs, answered from a snapshot (a `Game` satisfies the same shape).
 */
export type ReplayFrame = Pick<
  Game,
  'tileSet' | 'confirmedTiles' | 'pendingTile' | 'deadEnds' | 'status' | 'score' | 'verticesOf' | 'growthCircle'
>;

/**
 * Every position of a record, for a replay with a seek bar: frame 0 is the
 * opening, frame i the position right after step i (so steps.length + 1
 * frames). Throws like `replayRecord` on a bad record.
 */
export function replayFrames(record: GameRecord): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  replayWith(record, (game) => {
    const confirmed: readonly PlacedTile[] = game.confirmedTiles();
    const pending = game.pendingTile();
    const dead: readonly DeadEnd[] = game.deadEnds();
    const status: GameStatus = game.status();
    const score: Score = game.score();
    const circle = game.growthCircle();
    frames.push({
      tileSet: game.tileSet,
      confirmedTiles: () => confirmed,
      pendingTile: () => pending,
      deadEnds: () => dead,
      status: () => status,
      score: () => score,
      growthCircle: () => circle,
      verticesOf: game.verticesOf,
    });
  });
  return frames;
}

type XY = { x: number; y: number };

const cross = (a: XY, b: XY) => a.x * b.y - a.y * b.x;
const signedArea = (q: readonly XY[]) => q.reduce((s, a, i) => s + cross(a, q[(i + 1) % q.length]!), 0) / 2;

/** Signed area of the triangle (origin, a, b) intersected with the disc of radius r about the origin. */
function wedgeInDisc(a: XY, b: XY, r: number): number {
  const sector = (u: XY, v: XY) => ((r * r) / 2) * Math.atan2(cross(u, v), u.x * v.x + u.y * v.y);
  const d = { x: b.x - a.x, y: b.y - a.y };
  const A = d.x * d.x + d.y * d.y;
  const B = a.x * d.x + a.y * d.y;
  const C = a.x * a.x + a.y * a.y - r * r;
  const disc = B * B - A * C;
  if (A === 0) return 0;
  if (disc <= 0) return sector(a, b);
  const s = Math.sqrt(disc);
  const t1 = Math.max(0, (-B - s) / A);
  const t2 = Math.min(1, (-B + s) / A);
  if (t1 >= 1 || t2 <= 0 || t1 >= t2) return sector(a, b);
  const p1 = { x: a.x + t1 * d.x, y: a.y + t1 * d.y };
  const p2 = { x: a.x + t2 * d.x, y: a.y + t2 * d.y };
  return sector(a, p1) + cross(p1, p2) / 2 + sector(p2, b);
}

/** Area of a simple counter-clockwise polygon inside the disc (centre c, radius r). */
function areaInDisc(q: readonly XY[], c: XY, r: number): number {
  const local = q.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  return local.reduce((s, a, i) => s + wedgeInDisc(a, local[(i + 1) % local.length]!, r), 0);
}

const segmentDistance = (p: XY, a: XY, b: XY) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

/** Inside or on the boundary of a simple counter-clockwise polygon (float; presentation only). */
function covers(q: readonly XY[], p: XY): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i]!;
    const b = q[j]!;
    if (segmentDistance(p, a, b) < 1e-9) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Statistics of the confirmed tiling a record ends with. Throws like `replayRecord` on a bad record. */
export function analyzeRecord(record: GameRecord): GameStats {
  // the mode of each placed tile that ends up confirmed: a place step confirms the previous
  // pending tile; removed tiles, the game-ending tile and a final pending tile do not count
  const modes = { free: 0, flow: 0 };
  let pendingMode: PlayMode | null = null;
  const game = replayWith(record, (g, i) => {
    const step = record.steps[i - 1];
    if (!step) return;
    if (step.type === 'remove') pendingMode = null;
    if (step.type !== 'place') return;
    if (pendingMode) modes[pendingMode]++;
    pendingMode = g.pendingTile() ? (step.mode ?? 'free') : null;
  });
  const tiles = game.confirmedTiles();
  const count = (kind: string) => tiles.filter((t) => t.kind === kind).length;
  const kites = count('kite');
  const darts = count('dart');
  const area = tiles.reduce((s, t) => s + shapeOf(game.tileSet, t.kind).area, 0);

  const polys = tiles.map((t) => t.vertices.map(toXY));
  let cx = 0;
  let cy = 0;
  for (const q of polys) {
    q.forEach((p, i) => {
      const n = q[(i + 1) % q.length]!;
      const w = cross(p, n);
      cx += (p.x + n.x) * w;
      cy += (p.y + n.y) * w;
    });
  }
  const total = polys.reduce((s, q) => s + signedArea(q), 0);
  const centroid = total > 0 ? { x: cx / (6 * total), y: cy / (6 * total) } : { x: 0, y: 0 };

  // boundary edges: directed tile edges whose reverse belongs to no other tile (no T-junctions in a legal tiling)
  const edgeKey = (a: string, b: string) => `${a}>${b}`;
  const edges = new Set<string>();
  for (const t of tiles) {
    const keys = t.vertices.map(pointKey);
    keys.forEach((k, i) => edges.add(edgeKey(k, keys[(i + 1) % keys.length]!)));
  }
  let completeRadius = 0;
  if (polys.some((q) => covers(q, centroid))) {
    completeRadius = Infinity;
    for (const t of tiles) {
      const keys = t.vertices.map(pointKey);
      keys.forEach((k, i) => {
        const j = (i + 1) % keys.length;
        if (edges.has(edgeKey(keys[j]!, k))) return;
        completeRadius = Math.min(completeRadius, segmentDistance(centroid, toXY(t.vertices[i]!), toXY(t.vertices[j]!)));
      });
    }
    if (!Number.isFinite(completeRadius)) completeRadius = 0;
  }

  const equalAreaRadius = Math.sqrt(area / Math.PI);
  const roundness =
    area > 0
      ? Math.min(1, polys.reduce((s, q) => s + areaInDisc(q, centroid, equalAreaRadius), 0) / area)
      : 0;

  return {
    modes,
    tiles: tiles.length,
    area,
    kites,
    darts,
    kiteDartRatio: darts > 0 ? kites / darts : null,
    centroid,
    completeRadius,
    equalAreaRadius,
    roundness,
  };
}

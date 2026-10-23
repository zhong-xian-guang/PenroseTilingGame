/**
 * The rules engine's command/query interface. The UI talks to the game only
 * through this object.
 */
import { edgeDirection, placementVertices, type Placement } from './geometry';
import { P2 } from './p2';
import { DIRECTIONS, mod10, ORIGIN, pointKey, toXY, type Point } from './point';
import type { GameRecord, RecordStep } from './record';
import { centerOf, placementKey, Tiling } from './tiling';
import { shapeOf, type CornerRef, type TileKind, type TileSet } from './tileset';

export interface PlacedTile extends Placement {
  readonly id: number;
  /** Exact corner positions, counter-clockwise. */
  readonly vertices: readonly Point[];
}

export interface GameOptions {
  readonly tileSet?: TileSet;
  /** The opening patch (trusted, not validated). Defaults to a single kite at the origin. */
  readonly opening?: readonly Placement[];
  /** The seed `opening` was generated from, kept in the record for reference. */
  readonly seed?: number;
}

export interface Game {
  readonly tileSet: TileSet;

  // ---- queries ----
  /** Every tile on the board (confirmed tiling, then the pending tile), in placement order. */
  tiles(): readonly PlacedTile[];
  /** The confirmed tiling: every tile except the pending one. It never changes again. */
  confirmedTiles(): readonly PlacedTile[];
  /** The pending tile (the one placed last, still adjustable), or null. */
  pendingTile(): PlacedTile | null;
  /** Exact corner positions of any placement (placed or not), counter-clockwise. */
  verticesOf(placement: Placement): Point[];
  /** Every candidate placement of `kind`: legal, non-overlapping, sharing a whole edge with the tiling. */
  candidates(kind: TileKind): readonly Placement[];
  /**
   * The legal orientations of `kind` at a position (a point of the tiling):
   * every candidate placement with a corner on that point, ordered
   * counter-clockwise around it by the direction of the tile's centre.
   */
  orientationsAt(position: Point, kind: TileKind): readonly Placement[];
  /**
   * Hit-test for the pointer (floating-point world coordinates; presentation
   * only, never a rule decision): the candidate of `kind` whose centre is
   * nearest `at`, within `maxDistance` length units, expressed as a position
   * (the tiling vertex of that candidate nearest the pointer), its legal
   * orientations, and the index of the picked one.
   */
  pickNear(at: { x: number; y: number }, kind: TileKind, maxDistance?: number): Pick | null;
  /** What surrounds a vertex of the tiling, or null if no tile has a corner there. */
  vertexAt(point: Point): VertexInfo | null;
  /** The tile kind currently picked in the tray, if any. */
  selectedKind(): TileKind | null;
  /** 'playing' until a visible dead end is confirmed, then 'over' for good. */
  status(): GameStatus;
  /**
   * The visible dead ends on the board: boundary edges that no tile of any
   * kind, in any orientation, can be glued onto. While playing they can only
   * come from the pending tile (cause 'pending': mark them, the player may
   * still turn or remove it); once the game is over they are the confirmed
   * dead ends that ended it (cause 'confirmed').
   */
  deadEnds(): readonly DeadEnd[];
  /** Score of the confirmed tiling: its tile count and total area in squared length units. */
  score(): Score;
  /**
   * The game record so far: tile set, opening, and every step that changed
   * the board (places, turns and removals of the pending tile), in order.
   * `replayRecord` rebuilds this exact position from it.
   */
  record(): GameRecord;

  // ---- commands ----
  /** Pick a tile kind from the tray (or clear the pick with null). */
  select(kind: TileKind | null): void;
  /**
   * Put a tile down. It becomes the pending tile, and the previous pending
   * tile (if any) is confirmed. Returns false, changing nothing, unless it is
   * a candidate placement.
   *
   * `position` is the point of the tiling the tile was attached at (as in
   * `orientationsAt` / `pickNear`); turning the pending tile cycles through
   * the legal orientations there. When omitted or not a corner of the tile on
   * the tiling, the first such corner (in corner order) is used.
   *
   * If the board already shows a visible dead end (left by the pending
   * tile), putting the next tile down confirms the pending tile and ends the
   * game instead: the new tile is not added and does not score. That also
   * returns true; check `status()`. Once the game is over it returns false.
   */
  place(placement: Placement, position?: Point): boolean;
  /**
   * Turn the pending tile to the next (`step` = 1) or previous (-1) legal
   * orientation at its position, counter-clockwise order as in
   * `orientationsAt`, judged against the confirmed tiling. Returns false,
   * changing nothing, when there is no pending tile or it has no other
   * legal orientation.
   */
  turnPending(step?: number): boolean;
  /** Take the pending tile off the board. Returns false, changing nothing, when there is none. */
  removePending(): boolean;

  // ---- events ----
  /** Listen for changes; returns an unsubscribe function. */
  subscribe(listener: (event: GameEvent) => void): () => void;
}

export interface Pick {
  readonly position: Point;
  readonly orientations: readonly Placement[];
  readonly index: number;
}

export interface VertexInfo {
  readonly point: Point;
  /** The tile corners on this point, counter-clockwise. */
  readonly corners: readonly CornerRef[];
  /** True when the corners close a full turn. */
  readonly complete: boolean;
  /** Name of the matching vertex-atlas entry when complete, else null. */
  readonly configuration: string | null;
}

export type GameStatus = 'playing' | 'over';

export interface DeadEnd {
  /** The boundary edge nothing can be glued onto (exact endpoints, counter-clockwise along its tile). */
  readonly from: Point;
  readonly to: Point;
  /** 'pending': caused by the pending tile, game still on. 'confirmed': in the confirmed tiling, game over. */
  readonly cause: 'pending' | 'confirmed';
}

export interface Score {
  readonly tiles: number;
  /** Total area in squared length units (shortest edge = 1). */
  readonly area: number;
}

export type GameEvent =
  | { readonly type: 'tiling-changed' }
  | { readonly type: 'selection-changed' }
  | { readonly type: 'game-over' };

/** Name of the atlas entry equal to `corners` up to cyclic rotation, if any. */
function classify(tileSet: TileSet, corners: readonly CornerRef[]): string | null {
  const sig = (cs: readonly CornerRef[]) => cs.map((c) => `${c.kind}:${c.corner}`);
  const mine = sig(corners);
  for (const entry of tileSet.vertexAtlas) {
    const theirs = sig(entry.corners);
    if (theirs.length !== mine.length) continue;
    for (let r = 0; r < theirs.length; r++) {
      if (theirs.every((s, i) => s === mine[(i + r) % mine.length])) return entry.name;
    }
  }
  return null;
}

/** The tile sets a record can name. */
const TILE_SETS: Readonly<Record<string, TileSet>> = { [P2.id]: P2 };

export function createGame(options: GameOptions = {}): Game {
  return build(options).game;
}

/**
 * Rebuilds a game by replaying its record through the engine. Throws when the
 * tile set is unknown or a step is not legal at its point in the game.
 */
export function replayRecord(record: GameRecord): Game {
  return replayWith(record, () => {});
}

/**
 * Internal (not exported from index.ts): `replayRecord`, calling `visit` with
 * the game before the first step (index 0) and after each step i (index i + 1).
 */
export function replayWith(record: GameRecord, visit: (game: Game, index: number) => void): Game {
  const tileSet = TILE_SETS[record.tileSet];
  if (!tileSet) throw new Error(`Unknown tile set "${record.tileSet}" in record`);
  const { game, apply } = build({ tileSet, opening: record.opening, seed: record.seed });
  visit(game, 0);
  record.steps.forEach((step, i) => {
    if (!apply(step)) throw new Error(`Record step ${i} (${step.type}) is not legal here`);
    visit(game, i + 1);
  });
  return game;
}

function build(options: GameOptions): { game: Game; apply: (step: RecordStep) => boolean } {
  const tileSet = options.tileSet ?? P2;
  const opening = options.opening ?? [{ kind: 'kite' as TileKind, origin: ORIGIN, dir: 0 }];
  const tiling = new Tiling(tileSet);
  for (const p of opening) tiling.add(p);

  const toPlaced = (id: number): PlacedTile => {
    const rec = tiling.tiles[id]!;
    return { ...rec.placement, id, vertices: rec.vertices };
  };

  /** The pending tile is always the last tile of the tiling; `position` is where it was attached. */
  let pending: { id: number; position: Point } | null = null;
  let selected: TileKind | null = null;
  const steps: RecordStep[] = [];
  let status: GameStatus = 'playing';
  /** Dead edges of the current tiling, recomputed lazily after each change. */
  let deadCache: { from: Point; to: Point }[] | null = null;
  const deadEdges = () => (deadCache ??= tiling.deadEdges());
  const listeners = new Set<(event: GameEvent) => void>();
  const emit = (event: GameEvent) => {
    if (event.type === 'tiling-changed') deadCache = null;
    for (const l of [...listeners]) l(event);
  };

  const orientationsAt = (position: Point, kind: TileKind): Placement[] => {
    const key = pointKey(position);
    const at = toXY(position);
    const angleOf = (p: Placement) => {
      const c = centerOf(placementVertices(tileSet, p));
      const a = Math.atan2(c.y - at.y, c.x - at.x);
      return a < 0 ? a + 2 * Math.PI : a;
    };
    return tiling
      .candidates(kind)
      .filter((p) => placementVertices(tileSet, p).some((v) => pointKey(v) === key))
      .map((p) => ({ p, a: angleOf(p) }))
      .sort((x, y) => x.a - y.a)
      .map(({ p }) => p);
  };

  const place = (placement: Placement, position?: Point): boolean => {
    if (status === 'over') return false;
    if (!tileSet.kinds.includes(placement.kind) || !tiling.isLegal(placement)) return false;
    const attached = placementVertices(tileSet, placement).filter((v) => tiling.vertex(pointKey(v)));
    const anchor = (position && attached.find((v) => pointKey(v) === pointKey(position))) ?? attached[0]!;
    if (deadEdges().length > 0) {
      // confirm the pending tile; the confirmed tiling has a dead end, so the game ends here
      // (the step is recorded so a replay ends the same way; the new tile itself is not added)
      pending = null;
      status = 'over';
      steps.push({ type: 'place', placement: { ...placement, dir: mod10(placement.dir) }, position: anchor });
      emit({ type: 'tiling-changed' });
      emit({ type: 'game-over' });
      return true;
    }
    pending = { id: tiling.add(placement).id, position: anchor };
    steps.push({ type: 'place', placement: tiling.tiles[pending.id]!.placement, position: anchor });
    emit({ type: 'tiling-changed' });
    return true;
  };

  /** Turns the pending tile to `choose(current, legal orientations)`; false (no change) if that is not another legal one. */
  const turnTo = (choose: (current: Placement, options: Placement[]) => Placement | undefined): boolean => {
    if (pending === null) return false;
    const current = tiling.removeLast()!.placement;
    const options = orientationsAt(pending.position, current.kind);
    const wanted = choose(current, options);
    const ok =
      wanted !== undefined &&
      placementKey(wanted) !== placementKey(current) &&
      options.some((o) => placementKey(o) === placementKey(wanted));
    const next = ok ? wanted : current;
    pending = { ...pending, id: tiling.add(next).id };
    if (!ok) return false;
    steps.push({ type: 'turn', placement: tiling.tiles[pending.id]!.placement });
    emit({ type: 'tiling-changed' });
    return true;
  };

  const removePending = (): boolean => {
    if (pending === null) return false;
    tiling.removeLast();
    pending = null;
    steps.push({ type: 'remove' });
    emit({ type: 'tiling-changed' });
    return true;
  };

  const apply = (step: RecordStep): boolean => {
    switch (step.type) {
      case 'place':
        return place(step.placement, step.position);
      case 'turn':
        return turnTo(() => step.placement);
      case 'remove':
        return removePending();
    }
  };

  const game: Game = {
    tileSet,
    tiles: () => tiling.tiles.map((t) => toPlaced(t.id)),
    confirmedTiles: () => tiling.tiles.filter((t) => t.id !== pending?.id).map((t) => toPlaced(t.id)),
    pendingTile: () => (pending === null ? null : toPlaced(pending.id)),
    verticesOf: (p) => placementVertices(tileSet, p),
    candidates: (kind) => tiling.candidates(kind),
    orientationsAt,
    pickNear(at, kind, maxDistance = 2) {
      let best: { p: Placement; d: number } | null = null;
      for (const p of tiling.candidates(kind)) {
        const c = centerOf(placementVertices(tileSet, p));
        const d = Math.hypot(c.x - at.x, c.y - at.y);
        if (d <= maxDistance && (!best || d < best.d)) best = { p, d };
      }
      if (!best) return null;
      const picked = best.p;
      const onTiling = placementVertices(tileSet, picked).filter((v) => tiling.vertex(pointKey(v)));
      const distTo = (v: Point) => {
        const q = toXY(v);
        return Math.hypot(q.x - at.x, q.y - at.y);
      };
      const position = onTiling.reduce((a, b) => (distTo(b) < distTo(a) ? b : a));
      const orientations = orientationsAt(position, kind);
      const key = placementKey(picked);
      return { position, orientations, index: orientations.findIndex((o) => placementKey(o) === key) };
    },
    vertexAt(point) {
      const rec = tiling.vertex(pointKey(point));
      if (!rec) return null;
      const corners = rec.corners
        .map(({ tileId, corner }) => {
          const t = tiling.tiles[tileId]!;
          return { ref: { kind: t.placement.kind, corner }, out: edgeDirection(tileSet, t.placement, corner) };
        })
        .sort((a, b) => a.out - b.out)
        .map((c) => c.ref);
      const turn = corners.reduce((s, c) => s + shapeOf(tileSet, c.kind).corners[c.corner]!.angle, 0);
      const complete = turn === DIRECTIONS;
      return { point: rec.point, corners, complete, configuration: complete ? classify(tileSet, corners) : null };
    },
    selectedKind: () => selected,
    status: () => status,
    deadEnds: () => {
      const cause = status === 'over' ? 'confirmed' : 'pending';
      return deadEdges().map(({ from, to }) => ({ from, to, cause }));
    },
    score() {
      const confirmed = tiling.tiles.filter((t) => t.id !== pending?.id);
      const area = confirmed.reduce((s, t) => s + shapeOf(tileSet, t.placement.kind).area, 0);
      return { tiles: confirmed.length, area };
    },
    record: () => ({
      tileSet: tileSet.id,
      ...(options.seed === undefined ? {} : { seed: options.seed }),
      opening: opening.map((p) => ({ ...p })),
      steps: [...steps],
    }),

    select(kind) {
      if (kind !== null && !tileSet.kinds.includes(kind)) {
        throw new Error(`Tile set ${tileSet.id} has no tile kind "${kind}"`);
      }
      if (kind === selected) return;
      selected = kind;
      emit({ type: 'selection-changed' });
    },

    place,

    turnPending(step = 1) {
      return turnTo((current, options) => {
        const i = options.findIndex((o) => placementKey(o) === placementKey(current));
        const n = options.length;
        return n > 1 && i >= 0 ? options[(((i + step) % n) + n) % n] : undefined;
      });
    },

    removePending,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { game, apply };
}

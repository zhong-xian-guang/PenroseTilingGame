/**
 * Mistake backtrace (ticket 10): after the game, find the step by which the
 * position was already doomed at the latest, i.e. could no longer be part of
 * any Penrose tiling, even though the visible dead end came later.
 *
 * Method: forced-tile propagation. On the board after a step, repeatedly put
 * in the only legal tile wherever a boundary edge has exactly one; if some
 * boundary edge ends up with none, the position is doomed. A tile that is the
 * only legal one on an edge must be there in every extension, so a
 * contradiction found this way is real; the converse does not hold (some
 * doomed positions need search, and propagation is capped), so the answer is
 * an upper bound: "doomed by step N at the latest". The growth circle plays no
 * part here: doom is about the plane, not about the game's growth rule.
 *
 * Offline only: nothing here feeds back into the rules of a running game.
 */
import { replayWith } from './game';
import { toXY, type Point } from './point';
import type { GameRecord } from './record';
import { Tiling, type EdgeOwner } from './tiling';
import { BACKTRACE_MAX_FORCED } from './tuning';

export interface Backtrace {
  /**
   * The record step (1-based; the replay's frame index) after which the game
   * was doomed at the latest, or null when the game is not over (or has no
   * steps). Never later than the game-ending step.
   */
  readonly doomedAt: number | null;
  /** The visible dead ends the game ended on (empty unless it is over). */
  readonly deadEnds: readonly { readonly from: Point; readonly to: Point }[];
}

/**
 * New tiles change which tiles fit within this distance (centre to edge
 * midpoint): legality looks at tiles whose centres are less than 4 apart
 * (tiling.ts NEAR_RADIUS), and a filler's centre is within 1 of its edge.
 */
const INFLUENCE = 6;

/**
 * Forced-tile propagation over a tiling that grows step by step. Remembers
 * the boundary edges known to take at least two tiles: removing tiles only
 * loosens legality, so that stays true until a tile is added nearby.
 */
class Propagator {
  private readonly roomy = new Map<string, { x: number; y: number }>();

  constructor(readonly tiling: Tiling) {}

  add(placement: Parameters<Tiling['add']>[0]): void {
    const rec = this.tiling.add(placement);
    for (const [key, mid] of this.roomy) {
      if (Math.hypot(mid.x - rec.center.x, mid.y - rec.center.y) <= INFLUENCE) this.roomy.delete(key);
    }
  }

  /** Is the current tiling doomed by forced tiles? Leaves the tiling as it was. */
  doomed(): boolean {
    let forcedCount = 0;
    try {
      for (;;) {
        const verdict = this.scan();
        if (verdict === 'dead') return true;
        if (verdict === null || forcedCount >= BACKTRACE_MAX_FORCED) return false;
        this.add(verdict);
        forcedCount++;
      }
    } finally {
      for (let i = 0; i < forcedCount; i++) this.tiling.removeLast();
    }
  }

  /** 'dead' if a boundary edge takes no tile, else the forced tile of an edge that takes exactly one, else null. */
  private scan() {
    const edges: EdgeOwner[] = [...this.tiling.boundaryEdges()];
    for (const owner of edges) {
      const rec = this.tiling.tiles[owner.tileId]!;
      const j = (owner.edge + 1) % rec.keys.length;
      const key = `${rec.keys[owner.edge]}>${rec.keys[j]}`;
      if (this.roomy.has(key)) continue;
      const fits = this.tiling.fillers(owner, 2);
      if (fits.length === 0) return 'dead' as const;
      if (fits.length === 1) return fits[0]!;
      const a = toXY(rec.vertices[owner.edge]!);
      const b = toXY(rec.vertices[j]!);
      this.roomy.set(key, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
    return null;
  }
}

/**
 * Backtrace of a finished game's record: replays it and checks, in order,
 * each position a step left behind for doom. A position whose pending tile
 * is turned or removed by the very next step is skipped (that orientation
 * never stayed on the board). Throws like `replayRecord` on a bad record.
 */
export function backtraceRecord(record: GameRecord): Backtrace {
  let propagator: Propagator | null = null;
  let doomedAt: number | null = null;
  const game = replayWith(record, (g, index) => {
    if (doomedAt !== null) return;
    const next = record.steps[index];
    if (index === 0 || next?.type === 'turn' || next?.type === 'remove') return;
    propagator ??= new Propagator(new Tiling(g.tileSet));
    const board = g.tiles();
    // positions checked here only ever grow (skipped ones held the only changes that are undone)
    for (const t of board.slice(propagator.tiling.tiles.length)) propagator.add(t);
    if (propagator.doomed()) doomedAt = index;
  });
  if (game.status() !== 'over' || record.steps.length === 0) return { doomedAt: null, deadEnds: [] };
  return {
    doomedAt: doomedAt ?? record.steps.length,
    deadEnds: game.deadEnds().map(({ from, to }) => ({ from, to })),
  };
}

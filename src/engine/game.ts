/**
 * The rules engine's command/query interface. The UI talks to the game only
 * through this object.
 */
import { placementVertices, type Placement } from './geometry';
import { P2 } from './p2';
import { ORIGIN, type Point } from './point';
import { Tiling } from './tiling';
import type { TileKind, TileSet } from './tileset';

export interface PlacedTile extends Placement {
  readonly id: number;
  /** Exact corner positions, counter-clockwise. */
  readonly vertices: readonly Point[];
}

export interface GameOptions {
  readonly tileSet?: TileSet;
  /** The opening patch (trusted, not validated). Defaults to a single kite at the origin. */
  readonly opening?: readonly Placement[];
}

export interface Game {
  readonly tileSet: TileSet;

  // ---- queries ----
  /** Every tile on the board, in placement order. */
  tiles(): readonly PlacedTile[];
  /** Exact corner positions of any placement (placed or not), counter-clockwise. */
  verticesOf(placement: Placement): Point[];
  /** Every candidate placement of `kind`: legal, non-overlapping, sharing a whole edge with the tiling. */
  candidates(kind: TileKind): readonly Placement[];
}

export function createGame(options: GameOptions = {}): Game {
  const tileSet = options.tileSet ?? P2;
  const opening = options.opening ?? [{ kind: 'kite' as TileKind, origin: ORIGIN, dir: 0 }];
  const tiling = new Tiling(tileSet);
  for (const p of opening) tiling.add(p);

  const toPlaced = (id: number): PlacedTile => {
    const rec = tiling.tiles[id]!;
    return { ...rec.placement, id, vertices: rec.vertices };
  };

  return {
    tileSet,
    tiles: () => tiling.tiles.map((t) => toPlaced(t.id)),
    verticesOf: (p) => placementVertices(tileSet, p),
    candidates: (kind) => tiling.candidates(kind),
  };
}

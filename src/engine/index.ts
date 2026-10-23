/**
 * Public surface of the rules engine. Everything outside `src/engine/` (UI,
 * board, tests) imports from here only. The engine has no DOM, Canvas or
 * Svelte dependency.
 */
export { createGame, replayRecord } from './game';
export { encodeRecord, decodeRecord, RecordFormatError, RECORD_VERSION } from './record';
export type { GameRecord, RecordStep } from './record';
export type { DeadEnd, Game, GameEvent, GameOptions, GameStatus, Pick, PlacedTile, Score, VertexInfo } from './game';
export type { Placement } from './geometry';
export { openingPatch, OPENING_MIN_TILES, OPENING_MAX_TILES } from './opening';
export { P2 } from './p2';
export type {
  ArcSpec,
  CornerRef,
  CornerSpec,
  EdgeSpec,
  TileKind,
  TileSet,
  TileShape,
  VertexConfiguration,
} from './tileset';
export { ORIGIN, DIRECTIONS, pointKey, samePoint, toXY, unit, plus, scale } from './point';
export type { Point } from './point';
export { PHI, zphi } from './zphi';
export type { ZPhi } from './zphi';

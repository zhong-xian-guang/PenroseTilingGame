/**
 * Public surface of the rules engine. Everything outside `src/engine/` (UI,
 * board, tests) imports from here only. The engine has no DOM, Canvas or
 * Svelte dependency.
 */
export { createGame, replayRecord } from './game';
export { analyzeRecord, replayFrames } from './analysis';
export type { GameStats, ReplayFrame } from './analysis';
export { encodeRecord, decodeRecord, RecordFormatError, RECORD_VERSION } from './record';
export type { GameRecord, PlayMode, RecordStep } from './record';
export type {
  DeadEnd,
  FlowSpot,
  Game,
  GameEvent,
  GameOptions,
  GameStatus,
  GrowthCircle,
  Pick,
  PlacedTile,
  Score,
  VertexInfo,
} from './game';
export { FLOW_NEAR_RADIUS, GROWTH_MARGIN } from './tuning';
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

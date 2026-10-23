/**
 * The game record (棋譜): everything needed to rebuild a position by replaying
 * it through the engine — tile set id, opening patch, and every step that
 * changed the board, including turns and removals of the pending tile.
 *
 * In memory a record uses the engine's exact types; `encodeRecord` turns it
 * into compact versioned JSON text (for IndexedDB, share links, files) and
 * `decodeRecord` checks the version and shape on the way back.
 *
 * Extending: steps are objects keyed by `op`, so later tickets add optional
 * fields to a step (e.g. the play mode of ticket 08) without touching older
 * ones. A change old decoders cannot read must bump RECORD_VERSION and teach
 * `decodeRecord` to upgrade the older versions it still accepts.
 */
import type { Placement } from './geometry';
import { point, type Point } from './point';
import type { TileKind } from './tileset';
import { zphi } from './zphi';

export const RECORD_VERSION = 1;

export type RecordStep =
  /** A tile put down at `position` (the tiling point it was attached at); it becomes the pending tile. */
  | { readonly type: 'place'; readonly placement: Placement; readonly position: Point }
  /** The pending tile turned to `placement`. */
  | { readonly type: 'turn'; readonly placement: Placement }
  /** The pending tile taken off the board. */
  | { readonly type: 'remove' };

export interface GameRecord {
  readonly tileSet: string;
  /** Seed the opening patch was generated from, if known (informational; `opening` is authoritative). */
  readonly seed?: number;
  readonly opening: readonly Placement[];
  readonly steps: readonly RecordStep[];
}

// ---- encoded form (version 1) ----
type EncPoint = [number, number, number, number];
type EncPlacement = [string, number, number, number, number, number];
type EncStep = { op: 'place'; tile: EncPlacement; at: EncPoint } | { op: 'turn'; tile: EncPlacement } | { op: 'remove' };
interface EncRecord {
  version: number;
  tileSet: string;
  seed?: number;
  opening: EncPlacement[];
  steps: EncStep[];
}

const encPoint = (p: Point): EncPoint => [p.u.a, p.u.b, p.v.a, p.v.b];
const encPlacement = (p: Placement): EncPlacement => [p.kind, p.origin.u.a, p.origin.u.b, p.origin.v.a, p.origin.v.b, p.dir];

/** Versioned JSON text for a record. */
export function encodeRecord(record: GameRecord): string {
  const out: EncRecord = {
    version: RECORD_VERSION,
    tileSet: record.tileSet,
    ...(record.seed === undefined ? {} : { seed: record.seed }),
    opening: record.opening.map(encPlacement),
    steps: record.steps.map((s): EncStep => {
      switch (s.type) {
        case 'place':
          return { op: 'place', tile: encPlacement(s.placement), at: encPoint(s.position) };
        case 'turn':
          return { op: 'turn', tile: encPlacement(s.placement) };
        case 'remove':
          return { op: 'remove' };
      }
    }),
  };
  return JSON.stringify(out);
}

export class RecordFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordFormatError';
  }
}

const fail = (message: string): never => {
  throw new RecordFormatError(message);
};
const isInt = (x: unknown): x is number => Number.isSafeInteger(x);

const decPoint = (x: unknown): Point => {
  if (!Array.isArray(x) || x.length !== 4 || !x.every(isInt)) fail(`Bad point in record: ${JSON.stringify(x)}`);
  const [a, b, c, d] = x as EncPoint;
  return point(zphi(a, b), zphi(c, d));
};
const decPlacement = (x: unknown): Placement => {
  if (!Array.isArray(x) || x.length !== 6 || typeof x[0] !== 'string' || !x.slice(1).every(isInt)) {
    fail(`Bad tile in record: ${JSON.stringify(x)}`);
  }
  const [kind, a, b, c, d, dir] = x as EncPlacement;
  return { kind: kind as TileKind, origin: point(zphi(a, b), zphi(c, d)), dir };
};
const decStep = (x: unknown): RecordStep => {
  const s = (x ?? {}) as Partial<Record<string, unknown>>;
  switch (s.op) {
    case 'place':
      return { type: 'place', placement: decPlacement(s.tile), position: decPoint(s.at) };
    case 'turn':
      return { type: 'turn', placement: decPlacement(s.tile) };
    case 'remove':
      return { type: 'remove' };
    default:
      return fail(`Unknown step in record: ${JSON.stringify(x)}`);
  }
};

/** Parses text from `encodeRecord`. Throws RecordFormatError for another format version or a malformed record. */
export function decodeRecord(text: string): GameRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('Record is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null) return fail('Record is not an object');
  const r = raw as Partial<Record<string, unknown>>;
  if (r.version !== RECORD_VERSION) {
    fail(`Unsupported record version ${JSON.stringify(r.version)} (expected ${RECORD_VERSION})`);
  }
  if (typeof r.tileSet !== 'string') fail('Record has no tile set');
  if (r.seed !== undefined && !isInt(r.seed)) fail('Record seed is not an integer');
  if (!Array.isArray(r.opening)) fail('Record has no opening');
  if (!Array.isArray(r.steps)) fail('Record has no steps');
  return {
    tileSet: r.tileSet as string,
    ...(r.seed === undefined ? {} : { seed: r.seed as number }),
    opening: (r.opening as unknown[]).map(decPlacement),
    steps: (r.steps as unknown[]).map(decStep),
  };
}

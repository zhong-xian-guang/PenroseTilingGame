/**
 * Autosave to IndexedDB (persistence layer; not unit-tested — verified in the browser).
 *
 * Each game gets a header (tile set, opening, record version) and its steps.
 * Steps up to the last `place` can never change again, so they are appended
 * one row each; the steps from the last `place` on (the pending tile's
 * placement, turns and removal) live in a single "current pending" row that
 * is overwritten on every change. Resuming concatenates both and replays the
 * record through the engine. The newest RECENT_GAMES games are kept.
 *
 * There is deliberately no manual save or load.
 */
import { RECORD_VERSION, replayRecord, type Game, type GameRecord, type PlayMode, type RecordStep } from '../engine';
import { done, req } from './idb';

const DB_NAME = 'penrose-tiling';
const DB_VERSION = 1;
export const RECENT_GAMES = 10;

interface GameHeader {
  id: string;
  version: number;
  tileSet: string;
  seed?: number;
  opening: GameRecord['opening'];
  startedAt: number;
}
interface StepRow {
  gameId: string;
  index: number;
  step: RecordStep;
}
interface PendingRow {
  gameId: string;
  steps: RecordStep[];
  /**
   * The play mode at the last save. A mode switch changes no record step, so
   * it is kept here for resuming (optional: rows written before it existed
   * have none, and the replayed mode stands).
   */
  mode?: PlayMode;
}

/** A saved game, as listed by `recentGames`. */
export interface SavedGame {
  readonly id: string;
  readonly startedAt: number;
  readonly record: GameRecord;
}

/** The app's database (also used by best.ts, which keeps personal bests in the `meta` store). */
export function openDb(): Promise<IDBDatabase> {
  const r = indexedDB.open(DB_NAME, DB_VERSION);
  r.onupgradeneeded = () => {
    const db = r.result;
    db.createObjectStore('games', { keyPath: 'id' }).createIndex('startedAt', 'startedAt');
    db.createObjectStore('steps', { keyPath: ['gameId', 'index'] });
    db.createObjectStore('pending', { keyPath: 'gameId' });
    db.createObjectStore('meta');
  };
  return req(r);
}

/** Index of the last `place` step: everything before it is final. */
const pendingStart = (steps: readonly RecordStep[]): number => {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i]!.type === 'place') return i;
  return steps.length;
};

const stepRange = (gameId: string) => IDBKeyRange.bound([gameId, 0], [gameId, Infinity]);

async function readRecord(db: IDBDatabase, id: string): Promise<{ record: GameRecord; mode?: PlayMode } | null> {
  const tx = db.transaction(['games', 'steps', 'pending'], 'readonly');
  const [header, rows, pending] = await Promise.all([
    req(tx.objectStore('games').get(id) as IDBRequest<GameHeader | undefined>),
    req(tx.objectStore('steps').getAll(stepRange(id)) as IDBRequest<StepRow[]>),
    req(tx.objectStore('pending').get(id) as IDBRequest<PendingRow | undefined>),
  ]);
  if (!header || header.version !== RECORD_VERSION) return null;
  rows.sort((a, b) => a.index - b.index);
  const record: GameRecord = {
    tileSet: header.tileSet,
    ...(header.seed === undefined ? {} : { seed: header.seed }),
    opening: header.opening,
    steps: [...rows.map((r) => r.step), ...(pending?.steps ?? [])],
  };
  return pending?.mode ? { record, mode: pending.mode } : { record };
}

/** The most recent saved games (up to RECENT_GAMES, the current one included), newest first. */
export async function recentGames(): Promise<SavedGame[]> {
  const db = await openDb();
  const headers = (await req(db.transaction('games').objectStore('games').getAll())) as GameHeader[];
  headers.sort((a, b) => b.startedAt - a.startedAt);
  const out: SavedGame[] = [];
  for (const h of headers) {
    const r = await readRecord(db, h.id);
    if (r) out.push({ id: h.id, startedAt: h.startedAt, record: r.record });
  }
  return out;
}

export class Autosave {
  private game: Game | null = null;
  private gameId = '';
  private saved = 0; // final steps already written
  private off: (() => void) | null = null;
  private queue: Promise<void> = Promise.resolve();

  private constructor(private readonly db: IDBDatabase) {}

  /** Opens the store; resolves to null when IndexedDB is unavailable (the game then simply isn't saved). */
  static async open(): Promise<Autosave | null> {
    try {
      return new Autosave(await openDb());
    } catch {
      return null;
    }
  }

  /** The game that was being played when the page was last closed, replayed; null if none or unreadable. */
  async resume(): Promise<Game | null> {
    const id = (await req(this.db.transaction('meta').objectStore('meta').get('current'))) as string | undefined;
    if (!id) return null;
    const saved = await readRecord(this.db, id);
    if (!saved) return null;
    let game: Game;
    try {
      game = replayRecord(saved.record);
      if (saved.mode) game.setMode(saved.mode);
    } catch {
      return null;
    }
    this.attach(game, id, pendingStart(saved.record.steps));
    return game;
  }

  /** Start saving a brand-new game (it becomes the one to resume) and forget games beyond RECENT_GAMES. */
  async track(game: Game): Promise<void> {
    const record = game.record();
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const header: GameHeader = {
      id,
      version: RECORD_VERSION,
      tileSet: record.tileSet,
      ...(record.seed === undefined ? {} : { seed: record.seed }),
      opening: record.opening,
      startedAt: Date.now(),
    };
    this.attach(game, id, 0);
    this.enqueue(async () => {
      const tx = this.db.transaction(['games', 'meta'], 'readwrite');
      tx.objectStore('games').put(header);
      tx.objectStore('meta').put(id, 'current');
      await done(tx);
      await this.prune();
    });
    this.save();
  }

  /** Stop listening to the current game. */
  detach(): void {
    this.off?.();
    this.off = null;
    this.game = null;
  }

  /** Resolves when every write so far has finished. */
  flush(): Promise<void> {
    return this.queue;
  }

  private attach(game: Game, id: string, saved: number): void {
    this.detach();
    this.game = game;
    this.gameId = id;
    this.saved = saved;
    this.off = game.subscribe((e) => {
      if (e.type === 'tiling-changed' || e.type === 'mode-changed') this.save();
    });
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((err) => console.warn('Autosave failed', err));
  }

  /** Append newly final steps and overwrite the pending row, in one transaction. */
  private save(): void {
    if (!this.game) return;
    const steps = this.game.record().steps;
    const cut = pendingStart(steps);
    const fresh = steps.slice(this.saved, cut).map((step, i) => ({ gameId: this.gameId, index: this.saved + i, step }));
    const pending: PendingRow = { gameId: this.gameId, steps: steps.slice(cut), mode: this.game.mode() };
    this.saved = cut;
    this.enqueue(async () => {
      const tx = this.db.transaction(['steps', 'pending'], 'readwrite');
      for (const row of fresh) tx.objectStore('steps').put(row);
      tx.objectStore('pending').put(pending);
      await done(tx);
    });
  }

  private async prune(): Promise<void> {
    const headers = (await req(this.db.transaction('games').objectStore('games').getAll())) as GameHeader[];
    headers.sort((a, b) => b.startedAt - a.startedAt);
    const old = headers.slice(RECENT_GAMES).map((h) => h.id);
    if (old.length === 0) return;
    const tx = this.db.transaction(['games', 'steps', 'pending'], 'readwrite');
    for (const id of old) {
      tx.objectStore('games').delete(id);
      tx.objectStore('steps').delete(stepRange(id));
      tx.objectStore('pending').delete(id);
    }
    await done(tx);
  }
}

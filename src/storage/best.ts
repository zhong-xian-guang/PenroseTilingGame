/**
 * Personal best per tile set (ticket 09). Scores are compared by area, the
 * main score; the mode a game was played in does not matter. Stored in the
 * `meta` store of the autosave database under `best:<tileSet id>`, so no
 * schema change is needed. The IndexedDB part is verified in the browser;
 * `compareWithBest` is the tested rule.
 */
import type { Score } from '../engine';
import { openDb } from './autosave';
import { req } from './idb';

export interface BestComparison {
  /** The best before this game, or null if this is the first finished game of the tile set. */
  readonly previous: Score | null;
  /** The best including this game. */
  readonly best: Score;
  /** This game beat the previous best (strictly larger area), or is the first one. */
  readonly isNewBest: boolean;
}

export function compareWithBest(previous: Score | null, score: Score): BestComparison {
  const isNewBest = previous === null || score.area > previous.area;
  return { previous, best: isNewBest ? score : previous, isNewBest };
}

const keyOf = (tileSet: string) => `best:${tileSet}`;

async function storedBest(db: IDBDatabase, tileSet: string): Promise<Score | null> {
  return ((await req(db.transaction('meta').objectStore('meta').get(keyOf(tileSet)))) as Score | undefined) ?? null;
}

/**
 * Compares a just-finished game's score with the stored best of its tile set
 * and stores it if it is a new best. Submit each finished game once (a game
 * resumed already over uses `lookupBest`). Resolves to null when the best
 * cannot be read or a new best cannot be stored (IndexedDB unavailable or
 * failing): nothing is claimed that was not saved.
 */
export async function submitScore(tileSet: string, score: Score): Promise<BestComparison | null> {
  try {
    const db = await openDb();
    const result = compareWithBest(await storedBest(db, tileSet), score);
    if (result.isNewBest) {
      await req(db.transaction('meta', 'readwrite').objectStore('meta').put({ ...score }, keyOf(tileSet)));
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * The comparison for a game whose score was already submitted when it ended
 * (reopened after a reload): read only, never a new best. Null when storage is
 * unavailable or nothing is stored.
 */
export async function lookupBest(tileSet: string): Promise<BestComparison | null> {
  try {
    const best = await storedBest(await openDb(), tileSet);
    return best ? { previous: best, best, isNewBest: false } : null;
  } catch {
    return null;
  }
}

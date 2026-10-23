/**
 * Personal best per tile set (ticket 09). Scores are compared by area, the
 * main score; the mode a game was played in does not matter. Stored in the
 * `meta` store of the autosave database under `best:<tileSet id>`, so no
 * schema change is needed. The IndexedDB part is verified in the browser;
 * `compareWithBest` is the tested rule.
 */
import type { Score } from '../engine';
import { openDb } from './autosave';

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

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/**
 * Compares a finished game's score with the stored best of its tile set and
 * stores it if it is a new best. Resolves to a comparison against nothing when
 * IndexedDB is unavailable. (Resuming a finished game submits it again: it then
 * equals the stored best and is not reported as new.)
 */
export async function submitScore(tileSet: string, score: Score): Promise<BestComparison> {
  let previous: Score | null = null;
  try {
    const db = await openDb();
    previous = ((await req(db.transaction('meta').objectStore('meta').get(keyOf(tileSet)))) as Score | undefined) ?? null;
    const result = compareWithBest(previous, score);
    if (result.isNewBest) {
      await req(db.transaction('meta', 'readwrite').objectStore('meta').put({ ...score }, keyOf(tileSet)));
    }
    return result;
  } catch {
    return compareWithBest(previous, score);
  }
}

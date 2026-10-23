/**
 * Settings persistence in IndexedDB (persistence layer; not unit-tested, the
 * validation it relies on is `normalizeSettings`, which is).
 *
 * A separate small database from the game autosave, so neither schema has to
 * bump the other's version: `penrose-tiling-settings` v1, one key-value store
 * `settings`, key 'display' → { colors, showArcs }.
 * The language choice stays in localStorage (see src/i18n): it must be known
 * synchronously before the first render.
 */
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '../settings/palette';

const DB_NAME = 'penrose-tiling-settings';
const DB_VERSION = 1;
const STORE = 'settings';
const KEY = 'display';

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

/** The saved settings, or the defaults when there are none or storage is unavailable. */
export async function loadSettings(): Promise<Settings> {
  try {
    const db = await openDb();
    return normalizeSettings(await req(db.transaction(STORE).objectStore(STORE).get(KEY)));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Saves the settings; failures (private mode, blocked storage) only mean they won't persist. */
export async function saveSettings(settings: Settings): Promise<void> {
  try {
    const db = await openDb();
    const value: Settings = { colors: { ...settings.colors }, showArcs: settings.showArcs };
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, KEY));
  } catch (err) {
    console.warn('Saving settings failed', err);
  }
}

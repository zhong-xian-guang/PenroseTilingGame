/**
 * Mistake backtrace in the background (ticket 10): one worker per finished
 * record, the promise shared by the summary and the analysis page. Resolves to
 * null if the analysis fails or workers are unavailable; never rejects.
 */
import { backtraceRecord, type Backtrace, type GameRecord } from '../engine';

const cache = new WeakMap<GameRecord, Promise<Backtrace | null>>();

export function backtraceInBackground(record: GameRecord): Promise<Backtrace | null> {
  let pending = cache.get(record);
  if (!pending) {
    pending = run(record);
    cache.set(record, pending);
  }
  return pending;
}

function run(record: GameRecord): Promise<Backtrace | null> {
  if (typeof Worker === 'undefined') {
    // no workers: still off the current task, so the summary opens first
    return new Promise((resolve) =>
      setTimeout(() => {
        try {
          resolve(backtraceRecord(record));
        } catch {
          resolve(null);
        }
      }, 0),
    );
  }
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./backtrace.worker.ts', import.meta.url), { type: 'module' });
    const done = (result: Backtrace | null) => {
      worker.terminate();
      resolve(result);
    };
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: Backtrace }>) =>
      done(e.data.ok ? (e.data.result ?? null) : null);
    worker.onerror = () => done(null);
    worker.postMessage(record);
  });
}

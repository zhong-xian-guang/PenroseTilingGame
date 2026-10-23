/// <reference lib="webworker" />
/**
 * Runs the mistake backtrace (ticket 10) off the main thread: it replays the
 * whole record with forced-tile propagation, which can take a while.
 * Message in: a GameRecord. Message out: { ok: true, result: Backtrace } or { ok: false }.
 */
import { backtraceRecord, type GameRecord } from '../engine';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<GameRecord>) => {
  try {
    scope.postMessage({ ok: true, result: backtraceRecord(e.data) });
  } catch {
    scope.postMessage({ ok: false });
  }
};

/**
 * Hands a shared record to the player (browser only, not unit-tested): a link
 * goes to the system share sheet when there is one, else to the clipboard; a
 * file is downloaded.
 */
import type { GameRecord } from '../engine';
import { shareRecord } from './share';

export type Delivery = 'shared' | 'copied' | 'file' | 'cancelled';

export async function deliverRecord(record: GameRecord): Promise<Delivery> {
  const pageUrl = location.href.split('#')[0]!;
  const shared = await shareRecord(record, pageUrl);
  if (shared.kind === 'file') {
    const href = URL.createObjectURL(new Blob([shared.text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = shared.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
    return 'file';
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ url: shared.url });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // share sheet unavailable for this page: fall back to the clipboard
    }
  }
  await navigator.clipboard.writeText(shared.url);
  return 'copied';
}

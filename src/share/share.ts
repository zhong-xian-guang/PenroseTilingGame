/**
 * Sharing a game record (ticket 11). The share text is the record's versioned
 * JSON (engine `encodeRecord`) compressed with raw DEFLATE and written in
 * base64url, so it can go in a URL fragment as is (`#r=<text>`; a fragment is
 * never sent to a server). A record too long for a link is exported as a file
 * holding the plain record JSON instead.
 *
 * Uses the web CompressionStream API (browsers and Node 18+), which is why it
 * lives outside the DOM-free engine.
 */
import { decodeRecord, encodeRecord, RECORD_VERSION, replayRecord, type GameRecord } from '../engine';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** The URL-safe compressed text of a record. */
export async function encodeShareText(record: GameRecord): Promise<string> {
  const json = new TextEncoder().encode(encodeRecord(record));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/**
 * Longest share link offered; a longer record is exported as a file. Browsers
 * accept far longer URLs, but chat apps and QR codes do not.
 */
export const MAX_SHARE_URL_LENGTH = 4000;

/** Fragment key of a shared record: `#r=<share text>`. */
const HASH_KEY = 'r';

export type SharedRecord =
  | { readonly kind: 'link'; readonly url: string }
  | { readonly kind: 'file'; readonly fileName: string; readonly text: string };

/**
 * A link to `pageUrl` (its fragment replaced) that opens the record, or, if
 * that link would be longer than `maxUrlLength`, a file with the record JSON.
 */
export async function shareRecord(
  record: GameRecord,
  pageUrl: string,
  maxUrlLength = MAX_SHARE_URL_LENGTH,
): Promise<SharedRecord> {
  const url = new URL(pageUrl);
  url.hash = `${HASH_KEY}=${await encodeShareText(record)}`;
  if (url.href.length <= maxUrlLength) return { kind: 'link', url: url.href };
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  return { kind: 'file', fileName: `penrose-${stamp}.json`, text: encodeRecord(record) };
}

/**
 * The record a page address shares (`location.hash`), or null when its
 * fragment holds none. Throws ShareError when it holds one that cannot be read.
 */
export async function readShareHash(hash: string): Promise<GameRecord | null> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const text = params.get(HASH_KEY);
  return text === null ? null : decodeShareText(text);
}

/**
 * Why a shared record cannot be opened: written in a record format version
 * this build cannot read (`version` says which), or not a record at all.
 */
export class ShareError extends Error {
  constructor(
    readonly reason: 'version' | 'malformed',
    readonly version?: number,
  ) {
    super(reason === 'version' ? `Unsupported record version ${version}` : 'Not a game record');
    this.name = 'ShareError';
  }
}

/**
 * Parses plain record JSON (an exported file, or decompressed share text).
 * Throws ShareError: 'version' when the engine rejects a record carrying a
 * version number it does not accept, 'malformed' for anything else.
 */
export function readRecordFile(json: string): GameRecord {
  let record: GameRecord;
  try {
    record = decodeRecord(json);
  } catch {
    let version: unknown;
    try {
      version = (JSON.parse(json) as { version?: unknown } | null)?.version;
    } catch {
      // not JSON: malformed
    }
    throw typeof version === 'number' && version !== RECORD_VERSION
      ? new ShareError('version', version)
      : new ShareError('malformed');
  }
  try {
    replayRecord(record); // well-formed but not a legal game (unknown tile set, illegal step)
  } catch {
    throw new ShareError('malformed');
  }
  return record;
}

/** Reads text from `encodeShareText`. Throws ShareError (see readRecordFile). */
export async function decodeShareText(text: string): Promise<GameRecord> {
  let json: string;
  try {
    json = new TextDecoder().decode(await pipe(fromBase64Url(text), new DecompressionStream('deflate-raw')));
  } catch {
    throw new ShareError('malformed');
  }
  return readRecordFile(json);
}

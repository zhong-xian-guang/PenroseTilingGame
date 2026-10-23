import { describe, expect, it } from 'vitest';
import {
  createGame,
  encodeRecord,
  openingPatch,
  P2,
  pointKey,
  replayRecord,
  type Game,
  type Placement,
} from '../../src/engine';
import {
  decodeShareText,
  encodeShareText,
  MAX_SHARE_URL_LENGTH,
  readRecordFile,
  readShareHash,
  shareRecord,
  ShareError,
} from '../../src/share/share';

const keyOf = (p: Placement) => `${p.kind}@${pointKey(p.origin)}/${((p.dir % 10) + 10) % 10}`;

/** Everything a player can see of a position: confirmed tiling, pending tile, status and score. */
const snapshot = (game: Game) => ({
  confirmed: game.confirmedTiles().map(keyOf),
  pending: game.pendingTile() && keyOf(game.pendingTile()!),
  status: game.status(),
  score: game.score(),
});

/** Plays `n` placements (with a turn and a removal along the way), or until the game ends. */
const play = (game: Game, n: number) => {
  for (let i = 0; i < n && game.status() === 'playing'; i++) {
    const kind = i % 3 === 0 ? 'dart' : 'kite';
    const options = game.candidates(kind);
    if (options.length === 0) break;
    game.place(options[i % options.length]!);
    if (i === 1) game.turnPending();
    if (i === 3) game.removePending();
  }
};

describe('share text (the URL form of a record)', () => {
  it('encoding then decoding gives a record whose replay is exactly the original game', async () => {
    const game = createGame({ tileSet: P2, opening: openingPatch(7), seed: 7 });
    play(game, 12);

    const text = await encodeShareText(game.record());
    const replayed = replayRecord(await decodeShareText(text));
    expect(snapshot(replayed)).toEqual(snapshot(game));
  });

  it('is safe to put in a URL fragment as is', async () => {
    const game = createGame({ tileSet: P2, opening: openingPatch(3), seed: 3 });
    play(game, 8);
    const text = await encodeShareText(game.record());
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is shorter than the plain record text', async () => {
    const game = createGame({ tileSet: P2, opening: openingPatch(5), seed: 5 });
    play(game, 30);
    const record = game.record();
    expect((await encodeShareText(record)).length).toBeLessThan(encodeRecord(record).length / 2);
  });
});

describe('sharing a game', () => {
  const page = 'https://example.org/penrose/?lang=en#old';

  it('gives a link to the same page whose fragment opens the same game', async () => {
    const game = createGame({ tileSet: P2, opening: openingPatch(11), seed: 11 });
    play(game, 10);
    const shared = await shareRecord(game.record(), page);
    if (shared.kind !== 'link') throw new Error(`expected a link, got ${shared.kind}`);
    expect(shared.url.length).toBeLessThanOrEqual(MAX_SHARE_URL_LENGTH);

    const url = new URL(shared.url);
    expect(url.origin + url.pathname + url.search).toBe('https://example.org/penrose/?lang=en');
    const record = await readShareHash(url.hash);
    expect(snapshot(replayRecord(record!))).toEqual(snapshot(game));
  });

  it('falls back to a file once the link would be longer than the limit, and the file opens the same game', async () => {
    const game = createGame({ tileSet: P2, opening: openingPatch(13), seed: 13 });
    play(game, 10);
    const link = await shareRecord(game.record(), page);
    expect(link.kind).toBe('link');
    const limit = (link as { url: string }).url.length - 1;

    const shared = await shareRecord(game.record(), page, limit);
    if (shared.kind !== 'file') throw new Error(`expected a file, got ${shared.kind}`);
    expect(shared.fileName).toMatch(/\.json$/);
    expect(snapshot(replayRecord(readRecordFile(shared.text)))).toEqual(snapshot(game));
  });

  it('a page address without a shared record in its fragment opens nothing', async () => {
    expect(await readShareHash('')).toBeNull();
    expect(await readShareHash('#')).toBeNull();
    expect(await readShareHash('#settings')).toBeNull();
  });
});

/** Share text of an arbitrary JSON value, built independently of the module under test. */
const compressed = async (json: string) => {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

describe('reading a shared record that cannot be used', () => {
  const future = JSON.stringify({ version: 99, tileSet: 'p2', opening: [], steps: [] });

  it('reports a record from another format version as a version error, naming that version', async () => {
    const error = await decodeShareText(await compressed(future)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ShareError);
    expect(error).toMatchObject({ reason: 'version', version: 99 });
  });

  it('reports text that is not a record at all as malformed', async () => {
    for (const text of ['not-a-record', '', '%%%', await compressed('{"hello":1}')]) {
      const error = await decodeShareText(text).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ShareError);
      expect(error).toMatchObject({ reason: 'malformed' });
    }
  });

  it('reports a record whose steps cannot be replayed (an illegal tile) as malformed', async () => {
    const game = createGame({ tileSet: P2, opening: openingPatch(17), seed: 17 });
    play(game, 3);
    const enc = JSON.parse(encodeRecord(game.record())) as { steps: { tile?: number[] }[] };
    const step = enc.steps.find((s) => s.tile)!;
    step.tile![1] = (step.tile![1] as number) + 50; // move the tile far away from the board
    const json = JSON.stringify(enc);
    expect(() => readRecordFile(json)).toThrow(expect.objectContaining({ reason: 'malformed' }));
    await expect(decodeShareText(await compressed(json))).rejects.toMatchObject({ reason: 'malformed' });
  });

  it('applies the same checks to an imported file', () => {
    expect(() => readRecordFile(future)).toThrow(expect.objectContaining({ reason: 'version', version: 99 }));
    expect(() => readRecordFile('garbage')).toThrow(expect.objectContaining({ reason: 'malformed' }));
  });
});

/**
 * Off-screen cache of the confirmed tiling, so panning and zooming a board of
 * thousands of tiles redraws a handful of bitmaps instead of every tile.
 *
 * The plane is cut into square chunks of CHUNK device pixels at the cache's
 * scale. A chunk is drawn the first time it comes into view, holding every
 * confirmed tile that overlaps it; chunks outside the viewport are never
 * drawn. The confirmed tiling only grows, so a newly confirmed tile is just
 * drawn on top of the cached chunks it overlaps (the same order a full redraw
 * would use). The pending tile, preview, dead ends and other overlays are not
 * cached; the renderer draws them over the chunks every frame.
 *
 * While the zoom changes, the cached chunks are stretched. Once it has been
 * still for REBUILD_DELAY ms (or as soon as it is more than 2x off), a new
 * generation of chunks is started at the new scale. New chunks are drawn
 * within a time budget per frame; until a spot is covered, the previous
 * generation shows through, stretched, so a rebuild never stalls a frame.
 * At the cache's scale every chunk lands on whole device pixels, so there are
 * no seams; `snap` is the sub-pixel shift that makes that true, and the
 * renderer applies it to everything else as well.
 */
import { toXY, type Game, type PlacedTile } from '../engine';
import type { Camera, XY } from './camera';

/** Chunk side in device pixels. */
const CHUNK = 256;
/** Side of the world-space grid that indexes the confirmed tiles (length units). */
const CELL = 2;
/** Milliseconds the zoom must stay still before the cache is rebuilt at the new scale. */
export const REBUILD_DELAY = 150;
/** Milliseconds per frame spent drawing new chunks (at least one chunk is always drawn). */
const FRAME_BUDGET = 6;
/** Chunks kept beyond the visible ones (least recently drawn are dropped first). */
const SPARE_CHUNKS = 64;
/** World-space slack around a tile's box for outlines drawn past its edge. */
const PAD = 0.1;

/** Where world points land on a canvas (the board camera, or a chunk). */
export interface View {
  readonly scale: number;
  toScreen(p: XY): XY;
}

/** Draws one confirmed tile onto `ctx` through `view` (the renderer's tile painter). */
export type TilePainter = (ctx: CanvasRenderingContext2D, view: View, tile: PlacedTile, pts: XY[]) => void;

interface Chunk {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Frame number it was last shown in (for eviction). */
  used: number;
}

/** Chunks drawn at one scale. */
interface Generation {
  /** CSS px per length unit. */
  readonly scale: number;
  readonly chunks: Map<string, Chunk>;
}

interface IndexedTile {
  readonly tile: PlacedTile;
  readonly pts: XY[];
  readonly min: XY;
  readonly max: XY;
}

export class TileLayer {
  private current: Generation | null = null;
  /** The generation before `current`, shown underneath while `current` fills in. */
  private previous: Generation | null = null;
  private dpr = 1;
  /** Confirmed tiles in placement order, and a grid of their indices by world cell. */
  private readonly tiles: IndexedTile[] = [];
  private readonly grid = new Map<string, number[]>();
  private frame = 0;
  private painter: TilePainter | null = null;
  private style: unknown = null;
  private lastScaleChange = 0;
  private seenScale = 0;

  /**
   * Bring the cache up to date with the game and camera. Returns the
   * sub-pixel snap (device px) to apply to the frame, and whether the caller
   * should redraw after REBUILD_DELAY (the zoom is off the cache's scale, so
   * the cache wants rebuilding once it settles).
   */
  sync(game: Game, camera: Camera, dpr: number, painter: TilePainter, style: unknown, now: number) {
    if (style !== this.style || dpr !== this.dpr) {
      this.style = style;
      this.dpr = dpr;
      this.current = null;
      this.previous = null;
    }
    this.painter = painter;
    if (camera.scale !== this.seenScale) {
      this.seenScale = camera.scale;
      this.lastScaleChange = now;
    }
    const ratio = this.current ? camera.scale / this.current.scale : 0;
    const settled = now - this.lastScaleChange >= REBUILD_DELAY;
    if (!this.current || ratio > 2 || ratio < 0.5 || (ratio !== 1 && settled)) {
      this.previous = this.current;
      this.current = { scale: camera.scale, chunks: new Map() };
    }
    this.addConfirmed(game.confirmedTiles());
    const k = this.current.scale * dpr;
    const ox = (camera.width * dpr) / 2 - camera.x * k;
    const oy = (camera.height * dpr) / 2 + camera.y * k;
    const exact = camera.scale === this.current.scale;
    return {
      snap: exact ? { x: Math.round(ox) - ox, y: Math.round(oy) - oy } : { x: 0, y: 0 },
      wantsRebuild: !exact,
    };
  }

  /**
   * Draw the visible chunks onto `ctx` (device-pixel space; the transform is
   * replaced and restored). Returns true when some visible chunks are still
   * missing (drawn next frame: the caller should request another frame).
   */
  draw(ctx: CanvasRenderingContext2D, camera: Camera): boolean {
    const gen = this.current;
    if (!gen) return false;
    this.frame++;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const start = performance.now();
    let drawn = 0;
    const pending: [number, number][] = [];
    this.forVisible(gen, camera, (i, j) => {
      if (gen.chunks.has(`${i},${j}`)) return;
      pending.push([i, j]);
    });
    // fill in missing chunks within the frame budget; the previous generation covers the rest
    const missing = pending.filter(([i, j]) => {
      if (drawn > 0 && performance.now() - start > FRAME_BUDGET) return true;
      this.makeChunk(gen, i, j);
      drawn++;
      return false;
    });
    if (missing.length > 0 && this.previous) {
      const prev = this.previous;
      this.forVisible(prev, camera, (i, j, rect) => {
        const chunk = prev.chunks.get(`${i},${j}`);
        if (!chunk || chunk === EMPTY) return;
        chunk.used = this.frame;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(chunk.canvas, rect.x, rect.y, rect.w, rect.h);
      });
    } else {
      this.previous = null;
    }
    let count = 0;
    this.forVisible(gen, camera, (i, j, rect) => {
      count++;
      const chunk = gen.chunks.get(`${i},${j}`);
      if (!chunk || chunk === EMPTY) return;
      chunk.used = this.frame;
      ctx.imageSmoothingEnabled = camera.scale !== gen.scale;
      ctx.drawImage(chunk.canvas, rect.x, rect.y, rect.w, rect.h);
    });
    ctx.restore();
    this.evict(gen, count + SPARE_CHUNKS);
    return missing.length > 0;
  }

  /** Calls `fn` for every chunk of `gen` in view, with its device-pixel rectangle on the board. */
  private forVisible(
    gen: Generation,
    camera: Camera,
    fn: (i: number, j: number, rect: { x: number; y: number; w: number; h: number }) => void,
  ): void {
    const dpr = this.dpr;
    const k = gen.scale * dpr; // device px per unit in the chunks
    const r = camera.scale / gen.scale; // stretch while zooming
    const ox = (camera.width * dpr) / 2 - camera.x * k * r;
    const oy = (camera.height * dpr) / 2 + camera.y * k * r;
    const step = CHUNK * r;
    const w = camera.width * dpr;
    const h = camera.height * dpr;
    const i0 = Math.floor(-ox / step);
    const i1 = Math.floor((w - ox) / step);
    const j0 = Math.floor((oy - h) / step);
    const j1 = Math.floor(oy / step);
    for (let i = i0; i <= i1; i++) {
      const xa = Math.round(ox + i * step);
      const xb = Math.round(ox + (i + 1) * step);
      for (let j = j0; j <= j1; j++) {
        const ya = Math.round(oy - (j + 1) * step);
        const yb = Math.round(oy - j * step);
        fn(i, j, { x: xa, y: ya, w: xb - xa, h: yb - ya });
      }
    }
  }

  /** World rectangle covered by chunk (i, j) of `gen`. */
  private bounds(gen: Generation, i: number, j: number) {
    const size = CHUNK / (gen.scale * this.dpr);
    return { x0: i * size, y0: j * size, x1: (i + 1) * size, y1: (j + 1) * size };
  }

  /** Draw chunk (i, j) of `gen` (EMPTY when no tile touches it). */
  private makeChunk(gen: Generation, i: number, j: number): void {
    const key = `${i},${j}`;
    const ids = this.tilesIn(this.bounds(gen, i, j));
    if (ids.length === 0) {
      gen.chunks.set(key, EMPTY);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = CHUNK;
    canvas.height = CHUNK;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      gen.chunks.set(key, EMPTY);
      return;
    }
    const chunk: Chunk = { canvas, ctx, used: this.frame };
    for (const id of ids) this.paint(gen, chunk, i, j, this.tiles[id]!);
    gen.chunks.set(key, chunk);
  }

  private paint(gen: Generation, chunk: Chunk, i: number, j: number, t: IndexedTile): void {
    const { x0, y1 } = this.bounds(gen, i, j);
    const s = gen.scale;
    const view: View = { scale: s, toScreen: (p) => ({ x: (p.x - x0) * s, y: (y1 - p.y) * s }) };
    chunk.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.painter!(chunk.ctx, view, t.tile, t.pts);
  }

  /** Index any newly confirmed tiles and draw them into the cached chunks they overlap. */
  private addConfirmed(confirmed: readonly PlacedTile[]): void {
    if (confirmed.length < this.tiles.length) {
      // a different game: start over
      this.tiles.length = 0;
      this.grid.clear();
      if (this.current) this.current = { scale: this.current.scale, chunks: new Map() };
      this.previous = null;
    }
    for (let id = this.tiles.length; id < confirmed.length; id++) {
      const tile = confirmed[id]!;
      const pts = tile.vertices.map(toXY);
      const min = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
      const max = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) };
      const t: IndexedTile = { tile, pts, min, max };
      this.tiles.push(t);
      for (let cx = Math.floor(min.x / CELL); cx <= Math.floor(max.x / CELL); cx++) {
        for (let cy = Math.floor(min.y / CELL); cy <= Math.floor(max.y / CELL); cy++) {
          const key = `${cx},${cy}`;
          const cell = this.grid.get(key);
          if (cell) cell.push(id);
          else this.grid.set(key, [id]);
        }
      }
      for (const gen of [this.current, this.previous]) {
        if (!gen) continue;
        const size = CHUNK / (gen.scale * this.dpr);
        for (let i = Math.floor((min.x - PAD) / size); i <= Math.floor((max.x + PAD) / size); i++) {
          for (let j = Math.floor((min.y - PAD) / size); j <= Math.floor((max.y + PAD) / size); j++) {
            const key = `${i},${j}`;
            const chunk = gen.chunks.get(key);
            if (chunk === EMPTY) gen.chunks.delete(key); // no longer empty: draw it afresh when seen
            else if (chunk) this.paint(gen, chunk, i, j, t);
          }
        }
      }
    }
  }

  /** Indices (ascending = drawing order) of the confirmed tiles whose padded box meets world rectangle `b`. */
  private tilesIn(b: { x0: number; y0: number; x1: number; y1: number }): number[] {
    const found = new Set<number>();
    for (let cx = Math.floor((b.x0 - PAD) / CELL); cx <= Math.floor((b.x1 + PAD) / CELL); cx++) {
      for (let cy = Math.floor((b.y0 - PAD) / CELL); cy <= Math.floor((b.y1 + PAD) / CELL); cy++) {
        for (const id of this.grid.get(`${cx},${cy}`) ?? []) {
          const t = this.tiles[id]!;
          if (t.max.x < b.x0 - PAD || t.min.x > b.x1 + PAD || t.max.y < b.y0 - PAD || t.min.y > b.y1 + PAD) continue;
          found.add(id);
        }
      }
    }
    return [...found].sort((a, c) => a - c);
  }

  private evict(gen: Generation, keep: number): void {
    // EMPTY markers cost nothing to keep and are never evicted
    const drawn = [...gen.chunks].filter(([, c]) => c !== EMPTY);
    if (drawn.length <= keep) return;
    drawn.sort(([, a], [, b]) => a.used - b.used);
    for (const [key] of drawn.slice(0, drawn.length - keep)) gen.chunks.delete(key);
  }
}

/** Marks a chunk position known to hold no tile (nothing to draw). */
const EMPTY: Chunk = { canvas: null as unknown as HTMLCanvasElement, ctx: null as unknown as CanvasRenderingContext2D, used: 0 };

/**
 * Canvas 2D drawing of the board. Pure presentation: it reads the game
 * through its query interface and never decides anything about the rules.
 */
import { samePoint, toXY, type Game, type Placement, type Point, type TileKind } from '../engine';
import { DEFAULT_SETTINGS, derivePalette } from '../settings/palette';
import type { Camera, XY } from './camera';
import { edgeArc, tileOutline } from './outline';
import type { TileLayer, View } from './tile-layer';

export interface Palette {
  background: string;
  tiles: Record<TileKind, string>;
  outline: string;
  /** Outline of the pending tile (the one still adjustable). */
  pending: string;
  /** Marks a visible dead end (a boundary edge nothing fits onto). */
  deadEnd: string;
  /** The growth circle (only the boundary inside it takes new tiles); drawn faintly. */
  growthCircle: string;
  /** The flow-mode recommended spot. */
  flowSpot: string;
}

/** The default palette: the default settings' colours (and what derives from them), plus the fixed marks. */
export const DEFAULT_PALETTE: Palette = {
  ...derivePalette(DEFAULT_SETTINGS.colors),
  pending: '#d1495b',
  deadEnd: '#e03131',
  growthCircle: 'rgba(43, 52, 64, 0.35)',
  flowSpot: '#2f6fde',
};

/** What the renderer reads: a live Game, or a frozen replay frame (ReplayFrame). */
export type BoardView = Pick<
  Game,
  'tileSet' | 'confirmedTiles' | 'pendingTile' | 'deadEnds' | 'verticesOf' | 'growthCircle'
>;

export interface Preview {
  placement: Placement;
  position: Point;
}

export interface Scene {
  /** The pointer is over the pending tile (its wheel/right-click target). */
  pendingHovered: boolean;
  preview: Preview | null;
  /**
   * A tile held under a finger that is not (or no longer) on the tiling: a
   * tile dragged out of the tray with no candidate nearby, or the pending
   * tile being dragged back to the tray. `pts` are world coordinates.
   */
  ghost?: { placement: Placement; pts: XY[] } | null;
  /**
   * Off-screen cache of the confirmed tiling (see TileLayer). Without one,
   * the confirmed tiles in view are drawn directly every frame.
   */
  layer?: TileLayer | null;
  /** Frame time (ms, e.g. performance.now()); the layer uses it to tell when the zoom has settled. */
  now?: number;
  /** The flow-mode recommended spot (a point of the tiling), marked with a ring. */
  flowSpot?: Point | null;
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  game: BoardView,
  camera: Camera,
  dpr: number,
  palette: Palette,
  scene: Scene,
): {
  /** The tile cache is off the camera's zoom: draw again once the zoom has settled (REBUILD_DELAY). */
  redrawLater: boolean;
  /** Parts of the tile cache in view are still being drawn: draw again next frame. */
  redrawNow: boolean;
} {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, camera.width, camera.height);

  const layer = scene.layer ?? null;
  let redrawLater = false;
  if (layer) {
    const painter = (c: CanvasRenderingContext2D, view: View, tile: Placement, pts: XY[]) =>
      drawTile(c, game, view, palette, tile, pts, 1);
    const style = JSON.stringify(palette);
    const { snap, wantsRebuild } = layer.sync(game, camera, dpr, painter, style, scene.now ?? performance.now());
    redrawLater = wantsRebuild;
    // shift the whole frame by the layer's sub-pixel snap so overlays line up with the cached tiles
    ctx.setTransform(dpr, 0, 0, dpr, snap.x, snap.y);
  }

  // the growth circle: a faint dashed ring with a whisper of fill, under the tiles
  const circle = game.growthCircle();
  if (Number.isFinite(circle.radius) && circle.radius > 0) {
    const c = camera.toScreen(circle.center);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, circle.radius * camera.scale, 0, Math.PI * 2);
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = palette.growthCircle;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.growthCircle;
    ctx.stroke();
    ctx.restore();
  }

  let redrawNow = false;
  if (layer) {
    const transform = ctx.getTransform();
    redrawNow = layer.draw(ctx, camera);
    ctx.setTransform(transform);
  } else {
    // no cache: draw the confirmed tiles that are in view
    const min = camera.toWorld({ x: 0, y: camera.height });
    const max = camera.toWorld({ x: camera.width, y: 0 });
    for (const tile of game.confirmedTiles()) {
      const pts = tile.vertices.map(toXY);
      if (pts.every((p) => p.x < min.x - 1) || pts.every((p) => p.x > max.x + 1)) continue;
      if (pts.every((p) => p.y < min.y - 1) || pts.every((p) => p.y > max.y + 1)) continue;
      drawTile(ctx, game, camera, palette, tile, pts, 1);
    }
  }

  const pending = game.pendingTile();
  if (pending) {
    // the pending tile: slightly see-through, with a bold accent outline (thicker while hovered)
    const pts = pending.vertices.map(toXY);
    drawTile(ctx, game, camera, palette, pending, pts, 0.8);
    ctx.save();
    traceTile(ctx, camera, game, pending.kind, pts);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(scene.pendingHovered ? 3.5 : 2.5, camera.scale * (scene.pendingHovered ? 0.1 : 0.07));
    ctx.strokeStyle = palette.pending;
    ctx.stroke();
    ctx.restore();
  }

  drawDeadEnds(ctx, game, camera, palette);

  if (scene.flowSpot) {
    // the recommended spot: a ring around a dot, sized in screen pixels so it reads at any zoom
    const s = camera.toScreen(toXY(scene.flowSpot));
    ctx.save();
    ctx.strokeStyle = palette.flowSpot;
    ctx.fillStyle = palette.flowSpot;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(9, camera.scale * 0.22), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (scene.preview) {
    const pts = game.verticesOf(scene.preview.placement).map(toXY);
    ctx.save();
    drawTile(ctx, game, camera, palette, scene.preview.placement, pts, 0.55);
    traceTile(ctx, camera, game, scene.preview.placement.kind, pts);
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.outline;
    ctx.stroke();
    ctx.restore();

    const s = camera.toScreen(toXY(scene.preview.position));
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = palette.outline;
    ctx.fill();
  }

  if (scene.ghost) {
    ctx.save();
    drawTile(ctx, game, camera, palette, scene.ghost.placement, scene.ghost.pts, 0.4);
    traceTile(ctx, camera, game, scene.ghost.placement.kind, scene.ghost.pts);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.outline;
    ctx.stroke();
    ctx.restore();
  }
  return { redrawLater, redrawNow };
}

/** Visible dead ends: a translucent red pocket just outside each dead edge, and the edge itself in red. */
function drawDeadEnds(ctx: CanvasRenderingContext2D, game: BoardView, camera: Camera, palette: Palette): void {
  const dead = game.deadEnds();
  if (!dead.length) return;
  const pending = game.pendingTile();
  const tiles = pending ? [...game.confirmedTiles(), pending] : game.confirmedTiles();
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const { from, to } of dead) {
    const a = toXY(from);
    const b = toXY(to);
    // the tile lies to the left of from → to (counter-clockwise), so the empty side is to the right
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    const depth = 0.35 * len;
    const mid = { x: (a.x + b.x) / 2 + n.x * depth, y: (a.y + b.y) / 2 + n.y * depth };
    const edge = [a, ...deadEdgeArc(game, tiles, from, to), b];
    tracePath(ctx, camera, [...edge, mid]);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = palette.deadEnd;
    ctx.fill();
    ctx.globalAlpha = 1;
    tracePath(ctx, camera, edge, false);
    ctx.lineWidth = Math.max(3, camera.scale * 0.09);
    ctx.strokeStyle = palette.deadEnd;
    ctx.stroke();
  }
  ctx.restore();
}

/** The arc of the tile edge from → to (the inner points), following its tile's outline. */
function deadEdgeArc(game: BoardView, tiles: readonly { kind: TileKind; vertices: readonly Point[] }[], from: Point, to: Point): XY[] {
  for (const tile of tiles) {
    const i = tile.vertices.findIndex((v) => samePoint(v, from));
    if (i < 0 || !samePoint(tile.vertices[(i + 1) % tile.vertices.length]!, to)) continue;
    return edgeArc(toXY(from), toXY(to), game.tileSet.shapes[tile.kind]!.corners[i]!.label);
  }
  return [];
}

function tracePath(ctx: CanvasRenderingContext2D, camera: View, pts: XY[], close = true): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = camera.toScreen(p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  if (close) ctx.closePath();
}

/** Traces a tile's curved outline (see outline.ts). */
const traceTile = (ctx: CanvasRenderingContext2D, camera: View, game: BoardView, kind: TileKind, pts: XY[]) =>
  tracePath(ctx, camera, tileOutline(game.tileSet.shapes[kind]!, pts));

function drawTile(
  ctx: CanvasRenderingContext2D,
  game: BoardView,
  camera: View,
  palette: Palette,
  placement: Placement,
  pts: XY[],
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  traceTile(ctx, camera, game, placement.kind, pts);
  ctx.fillStyle = palette.tiles[placement.kind] ?? '#ccc';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, camera.scale * 0.025);
  ctx.strokeStyle = palette.outline;
  ctx.stroke();
  ctx.restore();
}

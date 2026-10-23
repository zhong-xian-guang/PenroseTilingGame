/**
 * Canvas 2D drawing of the board. Pure presentation: it reads the game
 * through its query interface and never decides anything about the rules.
 */
import { toXY, type Game, type Placement, type Point, type TileKind } from '../engine';
import type { Camera, XY } from './camera';

export interface Palette {
  background: string;
  tiles: Record<TileKind, string>;
  outline: string;
  arcA: string;
  arcB: string;
  /** Outline of the pending tile (the one still adjustable). */
  pending: string;
  /** Marks a visible dead end (a boundary edge nothing fits onto). */
  deadEnd: string;
  /** The growth circle (only the boundary inside it takes new tiles); drawn faintly. */
  growthCircle: string;
  /** The flow-mode recommended spot. */
  flowSpot: string;
}

export const DEFAULT_PALETTE: Palette = {
  background: '#f6f4ef',
  tiles: { kite: '#7fa6d6', dart: '#ecbc74' },
  outline: '#2b3440',
  arcA: '#8a3b2a',
  arcB: '#1f4f7a',
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
  showArcs: boolean;
  /** The pointer is over the pending tile (its wheel/right-click target). */
  pendingHovered: boolean;
  preview: Preview | null;
  /**
   * A tile held under a finger that is not (or no longer) on the tiling: a
   * tile dragged out of the tray with no candidate nearby, or the pending
   * tile being dragged back to the tray. `pts` are world coordinates.
   */
  ghost?: { placement: Placement; pts: XY[] } | null;
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
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, camera.width, camera.height);

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

  for (const tile of game.confirmedTiles()) {
    drawTile(ctx, game, camera, palette, tile, tile.vertices.map(toXY), scene.showArcs, 1);
  }

  const pending = game.pendingTile();
  if (pending) {
    // the pending tile: slightly see-through, with a bold accent outline (thicker while hovered)
    const pts = pending.vertices.map(toXY);
    drawTile(ctx, game, camera, palette, pending, pts, scene.showArcs, 0.8);
    ctx.save();
    tracePolygon(ctx, camera, pts);
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
    drawTile(ctx, game, camera, palette, scene.preview.placement, pts, scene.showArcs, 0.55);
    tracePolygon(ctx, camera, pts);
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
    drawTile(ctx, game, camera, palette, scene.ghost.placement, scene.ghost.pts, scene.showArcs, 0.4);
    tracePolygon(ctx, camera, scene.ghost.pts);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.outline;
    ctx.stroke();
    ctx.restore();
  }
}

/** Visible dead ends: a translucent red pocket just outside each dead edge, and the edge itself in red. */
function drawDeadEnds(ctx: CanvasRenderingContext2D, game: BoardView, camera: Camera, palette: Palette): void {
  const dead = game.deadEnds();
  if (!dead.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const { from, to } of dead) {
    const a = toXY(from);
    const b = toXY(to);
    // the tile lies to the left of from → to (counter-clockwise), so the empty side is to the right
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    const depth = 0.35 * len;
    const mid = { x: (a.x + b.x) / 2 + n.x * depth, y: (a.y + b.y) / 2 + n.y * depth };
    tracePolygon(ctx, camera, [a, b, mid]);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = palette.deadEnd;
    ctx.fill();
    ctx.globalAlpha = 1;
    const sa = camera.toScreen(a);
    const sb = camera.toScreen(b);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.lineWidth = Math.max(3, camera.scale * 0.09);
    ctx.strokeStyle = palette.deadEnd;
    ctx.stroke();
  }
  ctx.restore();
}

function tracePolygon(ctx: CanvasRenderingContext2D, camera: Camera, pts: XY[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = camera.toScreen(p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  game: BoardView,
  camera: Camera,
  palette: Palette,
  placement: Placement,
  pts: XY[],
  showArcs: boolean,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  tracePolygon(ctx, camera, pts);
  ctx.fillStyle = palette.tiles[placement.kind] ?? '#ccc';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, camera.scale * 0.025);
  ctx.strokeStyle = palette.outline;
  ctx.stroke();

  if (showArcs) {
    const shape = game.tileSet.shapes[placement.kind]!;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.2, camera.scale * 0.06);
    for (const arc of shape.arcs) {
      const v = pts[arc.corner]!;
      const next = pts[(arc.corner + 1) % pts.length]!;
      const start = Math.atan2(next.y - v.y, next.x - v.x);
      const sweep = (shape.corners[arc.corner]!.angle * Math.PI) / 5;
      ctx.beginPath();
      const steps = 24;
      for (let k = 0; k <= steps; k++) {
        const a = start + (sweep * k) / steps;
        const s = camera.toScreen({ x: v.x + arc.radius * Math.cos(a), y: v.y + arc.radius * Math.sin(a) });
        if (k === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      ctx.strokeStyle = arc.family === 'A' ? palette.arcA : palette.arcB;
      ctx.stroke();
    }
  }
  ctx.restore();
}

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
}

export const DEFAULT_PALETTE: Palette = {
  background: '#f6f4ef',
  tiles: { kite: '#7fa6d6', dart: '#ecbc74' },
  outline: '#2b3440',
  arcA: '#8a3b2a',
  arcB: '#1f4f7a',
};

export interface Preview {
  placement: Placement;
  position: Point;
}

export interface Scene {
  showArcs: boolean;
  preview: Preview | null;
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  game: Game,
  camera: Camera,
  dpr: number,
  palette: Palette,
  scene: Scene,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, camera.width, camera.height);

  for (const tile of game.tiles()) {
    drawTile(ctx, game, camera, palette, tile, tile.vertices.map(toXY), scene.showArcs, 1);
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
  game: Game,
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

/**
 * The board: a Canvas 2D view of the game plus mouse input. It turns pointer
 * gestures into camera moves and engine commands; all rule decisions come
 * from the engine's queries.
 *
 * Mouse:
 *   drag            pan
 *   wheel           cycle the legal orientations at the previewed position
 *                   (zooms instead when no preview is shown)
 *   ctrl/⌘ + wheel  zoom (also trackpad pinch)
 *   left click      place the previewed tile
 *
 * Over the pending tile (the one placed last):
 *   wheel           cycle its legal orientations
 *   right click     remove it
 */
import { pointKey, toXY, type Game, type Pick, type Point } from '../engine';
import { Camera, type XY } from './camera';
import { DEFAULT_PALETTE, drawBoard, type Palette } from './renderer';

const DRAG_THRESHOLD = 4; // CSS px before a press becomes a pan
const WHEEL_ZOOM = 1.0015; // per wheel delta unit

interface Hover {
  pick: Pick;
  index: number;
}

export class Board {
  readonly camera = new Camera();
  palette: Palette = DEFAULT_PALETTE;
  showArcs = true;

  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private frame = 0;
  private pointer: XY | null = null;
  private press: { start: XY; last: XY; dragging: boolean; id: number } | null = null;
  private hover: Hover | null = null;
  /** The pointer is over the pending tile: it takes the wheel and right click, and no preview is shown. */
  private overPending = false;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly game: Game,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.cleanup.push(() => ro.disconnect());
    this.resize();
    this.fitToTiling();

    this.listen(canvas, 'pointerdown', (e) => this.onPointerDown(e));
    this.listen(canvas, 'pointermove', (e) => this.onPointerMove(e));
    this.listen(canvas, 'pointerup', (e) => this.onPointerUp(e));
    this.listen(canvas, 'pointercancel', () => (this.press = null));
    this.listen(canvas, 'pointerleave', () => {
      this.pointer = null;
      this.updateHover();
    });
    this.listen(canvas, 'wheel', (e) => this.onWheel(e), { passive: false });
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this.cleanup.push(
      game.subscribe(() => {
        this.hover = null;
        this.updateHover();
      }),
    );
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    for (const f of this.cleanup) f();
  }

  zoomBy(factor: number): void {
    this.camera.zoomAt({ x: this.camera.width / 2, y: this.camera.height / 2 }, factor);
    this.updateHover();
  }

  fitToTiling(): void {
    const pts = this.game.tiles().flatMap((t) => t.vertices.map(toXY));
    if (!pts.length) return;
    const min = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
    const max = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) };
    this.camera.fit(min, max, 3);
    this.requestDraw();
  }

  requestDraw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** Re-run hit-testing, e.g. after the tray selection changes. */
  refresh(): void {
    this.hover = null;
    this.updateHover();
  }

  private listen<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void {
    el.addEventListener(type, fn, opts);
    this.cleanup.push(() => el.removeEventListener(type, fn, opts));
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.camera.width = Math.max(1, rect.width);
    this.camera.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.camera.width * this.dpr);
    this.canvas.height = Math.round(this.camera.height * this.dpr);
    this.requestDraw();
  }

  private local(e: MouseEvent): XY {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button === 2) {
      this.pointer = this.local(e);
      this.updateHover();
      if (this.overPending) this.game.removePending();
      return;
    }
    if (e.button !== 0 || this.press) return;
    const p = this.local(e);
    this.press = { start: p, last: p, dragging: false, id: e.pointerId };
    this.canvas.setPointerCapture(e.pointerId);
  }

  private onPointerMove(e: PointerEvent): void {
    const p = this.local(e);
    this.pointer = p;
    const press = this.press;
    if (press && press.id === e.pointerId) {
      if (!press.dragging && Math.hypot(p.x - press.start.x, p.y - press.start.y) > DRAG_THRESHOLD) {
        press.dragging = true;
      }
      if (press.dragging) {
        this.camera.panBy(p.x - press.last.x, p.y - press.last.y);
        press.last = p;
        this.requestDraw();
        return;
      }
    }
    this.updateHover();
  }

  private onPointerUp(e: PointerEvent): void {
    const press = this.press;
    if (!press || press.id !== e.pointerId) return;
    this.press = null;
    if (press.dragging) {
      this.updateHover();
      return;
    }
    const placement = this.previewPlacement();
    if (placement && this.hover) this.game.place(placement, this.hover.pick.position);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.local(e);
    this.pointer = p;
    if (!e.ctrlKey && !e.metaKey && this.overPending) {
      if (e.deltaY !== 0) this.game.turnPending(e.deltaY > 0 ? 1 : -1);
      return;
    }
    const hover = this.hover;
    if (e.ctrlKey || e.metaKey || !hover || hover.pick.orientations.length === 0) {
      this.camera.zoomAt(p, Math.pow(WHEEL_ZOOM, -e.deltaY * (e.deltaMode === 1 ? 16 : 1)));
      this.updateHover();
      return;
    }
    if (e.deltaY === 0) return;
    const n = hover.pick.orientations.length;
    hover.index = (hover.index + (e.deltaY > 0 ? 1 : -1) + n) % n;
    this.requestDraw();
  }

  private previewPlacement() {
    return this.hover ? (this.hover.pick.orientations[this.hover.index] ?? null) : null;
  }

  private updateHover(): void {
    const kind = this.game.selectedKind();
    const pending = this.game.pendingTile();
    this.overPending =
      !!pending &&
      !!this.pointer &&
      !this.press?.dragging &&
      insidePolygon(this.camera.toWorld(this.pointer), pending.vertices.map(toXY));
    if (!kind || !this.pointer || this.press?.dragging || this.overPending) {
      this.hover = null;
    } else {
      const world = this.camera.toWorld(this.pointer);
      const pick = this.game.pickNear(world, kind);
      if (!pick) {
        this.hover = null;
      } else if (
        this.hover &&
        samePosition(this.hover.pick.position, pick.position) &&
        this.hover.pick.index === pick.index
      ) {
        // the pointer still points at the same candidate: keep the orientation dialled in with the wheel
        this.hover = { pick, index: Math.min(this.hover.index, pick.orientations.length - 1) };
      } else {
        this.hover = { pick, index: Math.max(0, pick.index) };
      }
    }
    this.canvas.style.cursor = this.hover || this.overPending ? 'pointer' : 'grab';
    this.requestDraw();
  }

  private draw(): void {
    const placement = this.previewPlacement();
    drawBoard(this.ctx, this.game, this.camera, this.dpr, this.palette, {
      showArcs: this.showArcs,
      pendingHovered: this.overPending,
      preview: placement && this.hover ? { placement, position: this.hover.pick.position } : null,
    });
  }
}

const samePosition = (a: Point, b: Point) => pointKey(a) === pointKey(b);

/** Even-odd point-in-polygon test (pointer hit-testing only). */
function insidePolygon(p: XY, poly: readonly XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

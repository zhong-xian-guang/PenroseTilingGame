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
 *
 * Touch (and pen), all with one finger unless noted:
 *   drag from tray  carry a tile; the preview snaps to the candidate nearest a
 *                   point FINGER_LIFT px above the finger, so the finger does
 *                   not hide it; lifting the finger places it (as the pending
 *                   tile), or does nothing when no candidate is near or the
 *                   finger is back on the tray
 *   tap pending     cycle its legal orientations
 *   drag pending    drag it onto the tray to remove it
 *   drag elsewhere  pan
 *   two fingers     pinch zoom (and pan); never places anything
 *
 * Flow mode (game.mode() === 'flow'): the preview does not follow the pointer;
 * once a kind is picked it sits on the engine's recommended spot
 * (game.flowSpot()), and the player only picks the orientation:
 *   wheel / click / tap     next legal orientation there (a click or tap on the
 *                           preview itself places it)
 *   drag from tray          lifting the finger anywhere on the board places it
 * The camera pans smoothly to the spot only when it nears the edge of the
 * view (FLOW_PAN_MARGIN).
 */
import {
  FLOW_PAN_MARGIN,
  ORIGIN,
  pointKey,
  toXY,
  type Game,
  type Pick,
  type Placement,
  type Point,
  type TileKind,
} from '../engine';
import { Camera, type XY } from './camera';
import { DEFAULT_PALETTE, drawBoard, type Palette } from './renderer';

const DRAG_THRESHOLD = 4; // CSS px before a press becomes a pan
const WHEEL_ZOOM = 1.0015; // per wheel delta unit
const TOUCH_SLOP = 10; // CSS px a finger may wander and still count as a tap
const FINGER_LIFT = 72; // CSS px between the finger and the point it aims at
const PAN_EASE = 0.15; // share of the remaining distance the flow-mode camera covers per frame

/** What the fingers on the canvas are doing. */
type TouchGesture =
  | { type: 'pan'; id: number; start: XY; last: XY }
  /** A finger went down on the pending tile: a tap turns it, a drag carries it (to the tray to remove it). */
  | { type: 'pending'; id: number; start: XY; dragging: boolean }
  | { type: 'pinch'; dist: number; mid: XY }
  /** Fingers are down but no longer drive anything (e.g. after a pinch, until all fingers lift). */
  | { type: 'idle' };

/** A tile carried out of the tray by a finger. */
interface TrayDrag {
  id: number;
  kind: TileKind;
  /** Finger position in canvas CSS px. */
  finger: XY;
  overTray: boolean;
  hover: Hover | null;
}

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

  /** Element a carried tile can be dropped back onto (the tray); set by the UI. */
  trayElement: HTMLElement | null = null;
  /** Told whether a finger currently holds the pending tile over the tray (lifting it there removes it). */
  onTrayDropTarget: ((removing: boolean) => void) | null = null;

  private readonly touches = new Map<number, XY>();
  private gesture: TouchGesture | null = null;
  private trayDrag: TrayDrag | null = null;
  private trayDropTarget = false;
  private stopTrayDrag: () => void = () => {};
  /** Where the flow-mode camera is gliding to (world point to centre), if anywhere. */
  private panTarget: XY | null = null;

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
    this.listen(canvas, 'pointercancel', (e) => {
      if (e.pointerType === 'mouse') this.press = null;
      else this.onTouchEnd(e, true);
    });
    this.listen(canvas, 'pointerleave', () => {
      this.pointer = null;
      this.updateHover();
    });
    this.listen(canvas, 'wheel', (e) => this.onWheel(e), { passive: false });
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this.cleanup.push(
      game.subscribe((e) => {
        this.hover = null;
        this.updateHover();
        if (e.type === 'tiling-changed' || e.type === 'mode-changed') this.followFlowSpot();
      }),
    );
    this.followFlowSpot();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.stopTrayDrag();
    for (const f of this.cleanup) f();
  }

  zoomBy(factor: number): void {
    this.panTarget = null;
    this.camera.zoomAt({ x: this.camera.width / 2, y: this.camera.height / 2 }, factor);
    this.updateHover();
  }

  fitToTiling(): void {
    const pts = this.game.tiles().flatMap((t) => t.vertices.map(toXY));
    if (!pts.length) return;
    const min = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
    const max = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) };
    this.panTarget = null;
    this.camera.fit(min, max, 3);
    this.requestDraw();
  }

  requestDraw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.stepPan()) this.requestDraw();
      this.draw();
    });
  }

  /** Re-run hit-testing, e.g. after the tray selection changes. */
  refresh(): void {
    this.hover = null;
    this.updateHover();
  }

  private get flow(): boolean {
    return this.game.mode() === 'flow';
  }

  /**
   * Flow mode: when the recommended spot is near the edge of the view (or off
   * it), start gliding the camera to centre it; otherwise leave the view alone.
   */
  private followFlowSpot(): void {
    if (!this.flow || this.game.status() === 'over') return;
    const spot = this.game.flowSpot();
    if (!spot) return;
    const world = toXY(spot.position);
    const s = this.camera.toScreen(world);
    const { width: w, height: h } = this.camera;
    const m = Math.min(w, h) * FLOW_PAN_MARGIN;
    if (s.x < m || s.x > w - m || s.y < m || s.y > h - m) {
      this.panTarget = world;
      this.requestDraw();
    }
  }

  /** Moves the camera one frame towards panTarget; true while still moving. */
  private stepPan(): boolean {
    const t = this.panTarget;
    if (!t) return false;
    const dx = t.x - this.camera.x;
    const dy = t.y - this.camera.y;
    if (Math.hypot(dx, dy) * this.camera.scale < 0.5) {
      this.camera.x = t.x;
      this.camera.y = t.y;
      this.panTarget = null;
      return false;
    }
    this.camera.x += dx * PAN_EASE;
    this.camera.y += dy * PAN_EASE;
    return true;
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
    if (e.pointerType !== 'mouse') return this.onTouchDown(e);
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
    if (e.pointerType !== 'mouse') return this.onTouchMove(e);
    const p = this.local(e);
    this.pointer = p;
    const press = this.press;
    if (press && press.id === e.pointerId) {
      if (!press.dragging && Math.hypot(p.x - press.start.x, p.y - press.start.y) > DRAG_THRESHOLD) {
        press.dragging = true;
      }
      if (press.dragging) {
        this.panTarget = null;
        this.camera.panBy(p.x - press.last.x, p.y - press.last.y);
        press.last = p;
        this.requestDraw();
        return;
      }
    }
    this.updateHover();
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return this.onTouchEnd(e, false);
    const press = this.press;
    if (!press || press.id !== e.pointerId) return;
    this.press = null;
    if (press.dragging) {
      this.updateHover();
      return;
    }
    if (this.flow) return this.flowTap(this.camera.toWorld(this.local(e)));
    const placement = this.previewPlacement();
    if (placement && this.hover) this.game.place(placement, this.hover.pick.position);
  }

  /**
   * Flow mode click or tap at `world`: on the preview it places it; elsewhere
   * it dials the next legal orientation at the recommended spot.
   */
  private flowTap(world: XY): void {
    const hover = this.hover;
    const placement = this.previewPlacement();
    if (!hover || !placement || this.overPending) return;
    if (insidePolygon(world, this.game.verticesOf(placement).map(toXY))) {
      this.game.place(placement, hover.pick.position);
      return;
    }
    hover.index = (hover.index + 1) % hover.pick.orientations.length;
    this.requestDraw();
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
      this.panTarget = null;
      this.camera.zoomAt(p, Math.pow(WHEEL_ZOOM, -e.deltaY * (e.deltaMode === 1 ? 16 : 1)));
      this.updateHover();
      return;
    }
    if (e.deltaY === 0) return;
    const n = hover.pick.orientations.length;
    hover.index = (hover.index + (e.deltaY > 0 ? 1 : -1) + n) % n;
    this.requestDraw();
  }

  // ---- touch: carrying a tile out of the tray ----

  /**
   * A finger went down on the tray button for `kind`: the board follows that
   * finger (wherever its events are delivered) until it lifts.
   */
  beginTrayDrag(kind: TileKind, e: PointerEvent): void {
    if (this.trayDrag) return;
    this.game.select(kind);
    const drag: TrayDrag = { id: e.pointerId, kind, finger: this.local(e), overTray: true, hover: null };
    this.trayDrag = drag;
    const follow = (ev: PointerEvent) => {
      drag.finger = this.local(ev);
      drag.overTray = this.overTray(ev);
      if (drag.overTray || this.game.status() === 'over') {
        drag.hover = null;
      } else if (this.flow) {
        // flow mode: the tile snaps to the recommended spot wherever the finger is
        const pick = this.flowPick(kind);
        drag.hover = pick ? (drag.hover ?? { pick, index: 0 }) : null;
      } else {
        const pick = this.game.pickNear(this.camera.toWorld(aimOf(drag.finger)), kind);
        drag.hover = pick ? { pick, index: Math.max(0, pick.index) } : null;
      }
      this.requestDraw();
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId === drag.id) follow(ev);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== drag.id) return;
      stop();
      follow(ev);
      this.trayDrag = null;
      const placement = drag.hover?.pick.orientations[drag.hover.index];
      if (ev.type === 'pointerup' && placement && drag.hover) this.game.place(placement, drag.hover.pick.position);
      this.requestDraw();
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    this.stopTrayDrag = stop;
  }

  private overTray(e: MouseEvent): boolean {
    const r = this.trayElement?.getBoundingClientRect();
    return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  // ---- touch: fingers on the canvas ----

  private onTouchDown(e: PointerEvent): void {
    if (this.trayDrag) return;
    const p = this.local(e);
    this.touches.set(e.pointerId, p);
    this.canvas.setPointerCapture(e.pointerId);
    if (this.touches.size === 1) {
      const pending = this.game.pendingTile();
      const onPending = !!pending && insidePolygon(this.camera.toWorld(p), pending.vertices.map(toXY));
      this.gesture = onPending
        ? { type: 'pending', id: e.pointerId, start: p, dragging: false }
        : { type: 'pan', id: e.pointerId, start: p, last: p };
    } else if (this.touches.size === 2) {
      this.setTrayDropTarget(false);
      this.gesture = this.pinchState();
    } else {
      this.gesture = { type: 'idle' };
    }
    this.requestDraw();
  }

  private onTouchMove(e: PointerEvent): void {
    if (!this.touches.has(e.pointerId)) return;
    const p = this.local(e);
    this.touches.set(e.pointerId, p);
    const g = this.gesture;
    if (g?.type === 'pan' && g.id === e.pointerId) {
      this.panTarget = null;
      this.camera.panBy(p.x - g.last.x, p.y - g.last.y);
      g.last = p;
    } else if (g?.type === 'pending' && g.id === e.pointerId) {
      if (!g.dragging && Math.hypot(p.x - g.start.x, p.y - g.start.y) > TOUCH_SLOP) g.dragging = true;
      if (g.dragging) this.setTrayDropTarget(this.overTray(e));
    } else if (g?.type === 'pinch') {
      const next = this.pinchState();
      if (next.type === 'pinch') {
        this.panTarget = null;
        this.camera.panBy(next.mid.x - g.mid.x, next.mid.y - g.mid.y);
        if (g.dist > 0) this.camera.zoomAt(next.mid, next.dist / g.dist);
        this.gesture = next;
      }
    }
    this.requestDraw();
  }

  private onTouchEnd(e: PointerEvent, cancelled: boolean): void {
    if (!this.touches.delete(e.pointerId)) return;
    const g = this.gesture;
    if (g?.type === 'pending' && g.id === e.pointerId && !cancelled) {
      if (!g.dragging) this.game.turnPending(1);
      else if (this.overTray(e)) this.game.removePending();
    } else if (g?.type === 'pan' && g.id === e.pointerId && !cancelled && this.flow) {
      const p = this.local(e);
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) <= TOUCH_SLOP) this.flowTap(this.camera.toWorld(p));
    }
    this.setTrayDropTarget(false);
    // after a pinch the remaining finger does nothing until all fingers lift (no jump into a pan)
    this.gesture = this.touches.size === 0 ? null : { type: 'idle' };
    this.requestDraw();
  }

  private pinchState(): TouchGesture {
    const [a, b] = [...this.touches.values()];
    if (!a || !b) return { type: 'idle' };
    return { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  private setTrayDropTarget(removing: boolean): void {
    if (removing === this.trayDropTarget) return;
    this.trayDropTarget = removing;
    this.onTrayDropTarget?.(removing);
  }

  /** The tile a finger carries that is not snapped onto the tiling (see Scene.ghost). */
  private ghost(): { placement: Placement; pts: XY[] } | null {
    const drag = this.trayDrag;
    if (drag) {
      if (drag.hover || drag.overTray) return null;
      const placement: Placement = { kind: drag.kind, origin: ORIGIN, dir: 2 };
      const pts = this.game.verticesOf(placement).map(toXY);
      const c = centroid(pts);
      const at = this.camera.toWorld(aimOf(drag.finger));
      return { placement, pts: pts.map((q) => ({ x: q.x - c.x + at.x, y: q.y - c.y + at.y })) };
    }
    const g = this.gesture;
    const pending = this.game.pendingTile();
    const now = g?.type === 'pending' && g.dragging ? this.touches.get(g.id) : undefined;
    if (g?.type !== 'pending' || !now || !pending) return null;
    const a = this.camera.toWorld(g.start);
    const b = this.camera.toWorld(now);
    return { placement: pending, pts: pending.vertices.map(toXY).map((q) => ({ x: q.x + b.x - a.x, y: q.y + b.y - a.y })) };
  }

  private previewPlacement() {
    return this.hover ? (this.hover.pick.orientations[this.hover.index] ?? null) : null;
  }

  /** Flow mode: the recommended spot and the legal orientations of `kind` there, or null. */
  private flowPick(kind: TileKind): Pick | null {
    const spot = this.game.flowSpot();
    if (!spot) return null;
    const orientations = this.game.orientationsAt(spot.position, kind);
    return orientations.length > 0 ? { position: spot.position, orientations, index: 0 } : null;
  }

  private updateHover(): void {
    const kind = this.game.selectedKind();
    const pending = this.game.pendingTile();
    this.overPending =
      !!pending &&
      !!this.pointer &&
      !this.press?.dragging &&
      insidePolygon(this.camera.toWorld(this.pointer), pending.vertices.map(toXY));
    const over = this.game.status() === 'over';
    if (this.flow) {
      // the preview sits on the recommended spot, wherever the pointer is; keep the dialled orientation
      const pick = kind && !over ? this.flowPick(kind) : null;
      const prev = this.hover;
      const keep = !!pick && !!prev && samePosition(prev.pick.position, pick.position);
      this.hover = pick ? { pick, index: keep ? Math.min(prev!.index, pick.orientations.length - 1) : 0 } : null;
    } else if (!kind || over || !this.pointer || this.press?.dragging || this.overPending) {
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
    const hover = this.trayDrag ? this.trayDrag.hover : this.hover;
    const placement = hover ? (hover.pick.orientations[hover.index] ?? null) : null;
    const g = this.gesture;
    drawBoard(this.ctx, this.game, this.camera, this.dpr, this.palette, {
      showArcs: this.showArcs,
      pendingHovered: this.overPending || (g?.type === 'pending' && !g.dragging),
      preview: placement && hover ? { placement, position: hover.pick.position } : null,
      ghost: this.ghost(),
      flowSpot: this.flow && this.game.status() === 'playing' ? (this.game.flowSpot()?.position ?? null) : null,
    });
  }
}

const samePosition = (a: Point, b: Point) => pointKey(a) === pointKey(b);

/** The point a finger aims at: a little above it, so the finger does not hide what it points at. */
const aimOf = (finger: XY): XY => ({ x: finger.x, y: finger.y - FINGER_LIFT });

function centroid(pts: readonly XY[]): XY {
  const n = pts.length || 1;
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
}

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

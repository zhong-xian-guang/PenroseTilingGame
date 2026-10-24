/**
 * World ↔ screen mapping. World units are length units (short edge = 1),
 * y up; screen units are CSS pixels, y down.
 */
export interface XY {
  x: number;
  y: number;
}

export const MIN_SCALE = 8;
export const MAX_SCALE = 240;

export class Camera {
  /** World point shown at the centre of the viewport. */
  x = 0;
  y = 0;
  /** CSS pixels per length unit. */
  scale = 60;
  /** Viewport size in CSS pixels. */
  width = 1;
  height = 1;

  toScreen(p: XY): XY {
    return { x: this.width / 2 + (p.x - this.x) * this.scale, y: this.height / 2 - (p.y - this.y) * this.scale };
  }

  toWorld(s: XY): XY {
    return { x: (s.x - this.width / 2) / this.scale + this.x, y: -(s.y - this.height / 2) / this.scale + this.y };
  }

  /** Move the view by a screen-space drag delta. */
  panBy(dx: number, dy: number): void {
    this.x -= dx / this.scale;
    this.y += dy / this.scale;
  }

  /** Zoom by `factor`, keeping the world point under screen point `s` fixed. */
  zoomAt(s: XY, factor: number): void {
    const before = this.toWorld(s);
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    const after = this.toWorld(s);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** Centre on a world-space bounding box with some padding. */
  fit(min: XY, max: XY, padding = 2): void {
    this.x = (min.x + max.x) / 2;
    this.y = (min.y + max.y) / 2;
    const w = max.x - min.x + 2 * padding;
    const h = max.y - min.y + 2 * padding;
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(this.width / w, this.height / h)));
  }
}

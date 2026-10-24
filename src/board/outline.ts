/**
 * The curved outline every tile is drawn with: the matching rule carved into the shape, so a tile that
 * fits looks like it fits. Pure presentation; the engine still decides legality from the corner labels.
 *
 * Every P2 edge joins an 'H' corner to a 'T' corner, so "corners meeting at a point carry the same label"
 * is the same as "glued edges point the same way". Each edge is one symmetric circular arc: walking the
 * outline counter-clockwise it bulges out on an H→T edge and in on a T→H edge. Two glued tiles walk their
 * shared edge in opposite directions, so a legal glue meets out with in along the whole edge, and a reversed
 * tile meets out with out. Each corner has one outward and one inward edge, so the corner angles stay.
 */
import { PHI, type TileShape } from '../engine';
import type { XY } from './camera';

/** Arc height as a fraction of the edge length. */
const SAGITTA = 0.12;
/** Straight segments per edge. */
const STEPS = 16;
/** How far (world units) an outline reaches past its tile's corners: the arc height of the longest edge (φ). */
export const OUTLINE_REACH = SAGITTA * PHI;

/** Offsets (along the edge, to its left) of the arc's inner points, for an edge of length `len`. */
function arcOffsets(len: number): [number, number][] {
  const h = SAGITTA * len;
  const r = (len * len) / 4 / (2 * h) + h / 2;
  const out: [number, number][] = [];
  for (let k = 1; k < STEPS; k++) {
    const s = (len * k) / STEPS;
    out.push([s, Math.sqrt(r * r - (s - len / 2) ** 2) - (r - h)]);
  }
  return out;
}

/**
 * The inner points of the arc drawn for the edge `from` → `to` of a counter-clockwise outline, whose
 * `from` corner carries `fromLabel`: bulging out (to the right of the walk) from an 'H' corner, in otherwise.
 */
export function edgeArc(from: XY, to: XY, fromLabel: string): XY[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const out = fromLabel === 'H' ? 1 : -1;
  return arcOffsets(len).map(([s, v]) => ({ x: from.x + ux * s + uy * v * out, y: from.y + uy * s - ux * v * out }));
}

/** The outline of a tile with these corners (counter-clockwise, world units), starting at corner 0. */
export function tileOutline(shape: TileShape, corners: readonly XY[]): XY[] {
  return corners.flatMap((a, i) => [a, ...edgeArc(a, corners[(i + 1) % corners.length]!, shape.corners[i]!.label)]);
}

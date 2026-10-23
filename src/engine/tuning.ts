/**
 * Tunable game-balance constants, defined in one place.
 */

/**
 * Margin of the growth circle, in length units (short edge = 1): the circle's
 * radius is √(area / π) + GROWTH_MARGIN, where area is the confirmed tiling's.
 * Larger = more of the boundary is open for play; smaller = tighter, rounder growth.
 */
export const GROWTH_MARGIN = 1.5;

/**
 * Flow mode: how far from the last tile (centre to point, in length units) a
 * spot still counts as "nearby". Nearby spots are ranked by how constrained
 * they are; only when none is nearby does the recommendation jump to the
 * nearest spot. Larger = more jumping to tight spots; smaller = steadier path.
 */
export const FLOW_NEAR_RADIUS = 2;

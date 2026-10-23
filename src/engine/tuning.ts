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
 * Mistake backtrace (ticket 10): the most forced tiles the propagation adds to
 * one position before giving up on it (forcing can run on without end, e.g.
 * along a worm). Larger = finds doom further away, slower analysis.
 */
export const BACKTRACE_MAX_FORCED = 60;

/**
 * Flow mode: how far from the last tile (centre to point, in length units) a
 * spot still counts as "nearby". Nearby spots are ranked by how constrained
 * they are; only when none is nearby does the recommendation jump to the
 * nearest spot. Larger = more jumping to tight spots; smaller = steadier path.
 */
export const FLOW_NEAR_RADIUS = 2;

/**
 * Flow mode camera (presentation, kept here with the other tunables): the view
 * pans, smoothly, to centre the recommended spot only once it comes within
 * this fraction of the smaller viewport side of the edge (or leaves the view).
 * Larger = pans earlier and more often; smaller = steadier view.
 */
export const FLOW_PAN_MARGIN = 0.18;

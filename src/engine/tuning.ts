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

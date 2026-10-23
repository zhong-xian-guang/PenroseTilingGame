/**
 * Tunable game-balance constants, defined in one place.
 */

/**
 * Margin of the growth circle, in length units (short edge = 1): the circle's
 * radius is √(area / π) + GROWTH_MARGIN, where area is the confirmed tiling's.
 * Larger = more of the boundary is open for play; smaller = tighter, rounder growth.
 */
export const GROWTH_MARGIN = 1.5;

/**
 * P2: Penrose's kite and dart. Short edge 1, long edge φ.
 *
 * Corner 0 is the 72° apex between the two long edges; the tile's `dir` points
 * from corner 0 along the symmetry axis towards corner 2.
 *   kite corners: 72°, 72°, 144°, 72°
 *   dart corners: 72°, 36°, 216°, 36° (corner 2 is the reflex notch)
 *
 * Matching rule (equivalent to Conway's arcs / Penrose's edge arrows): every
 * vertex carries one of two labels, and all corners meeting at a point must
 * carry the same label. Kite corners 0 and 2 and dart corners 1 and 3 are
 * labelled 'H'; the rest are 'T'. Glued edges must also have equal length.
 */
import { Z1, ZPHI } from './zphi';
import type { TileSet, TileShape, VertexConfiguration } from './tileset';

const SIN36 = Math.sin(Math.PI / 5);
const SIN72 = Math.sin((2 * Math.PI) / 5);
const PHI = (1 + Math.sqrt(5)) / 2;

const LONG = { length: ZPHI, label: 'long' } as const;
const SHORT = { length: Z1, label: 'short' } as const;

const kite: TileShape = {
  kind: 'kite',
  corners: [
    { angle: 2, label: 'H' },
    { angle: 2, label: 'T' },
    { angle: 4, label: 'H' },
    { angle: 2, label: 'T' },
  ],
  edges: [
    { turn: -1, ...LONG },
    { turn: 2, ...SHORT },
    { turn: 3, ...SHORT },
    { turn: 6, ...LONG },
  ],
  triangles: [
    [0, 1, 2],
    [0, 2, 3],
  ],
  area: PHI * PHI * SIN36,
  arcs: [
    { corner: 0, radius: 1, family: 'A' },
    { corner: 2, radius: 1 / PHI, family: 'B' },
  ],
};

const dart: TileShape = {
  kind: 'dart',
  corners: [
    { angle: 2, label: 'T' },
    { angle: 1, label: 'H' },
    { angle: 6, label: 'T' },
    { angle: 1, label: 'H' },
  ],
  edges: [
    { turn: -1, ...LONG },
    { turn: 3, ...SHORT },
    { turn: 2, ...SHORT },
    { turn: 6, ...LONG },
  ],
  triangles: [
    [0, 1, 2],
    [0, 2, 3],
  ],
  area: SIN72, // = sin 108°; kite area / dart area = φ
  arcs: [
    { corner: 0, radius: 1 / PHI, family: 'A' },
    { corner: 2, radius: 1 / (PHI * PHI), family: 'B' },
  ],
};

const K = (corner: number) => ({ kind: 'kite', corner });
const D = (corner: number) => ({ kind: 'dart', corner });

/**
 * Conway's seven vertex neighbourhoods, corners listed counter-clockwise.
 * Sun, jack and deuce are 'H' vertices; star, queen, king and ace are 'T'.
 */
const vertexAtlas: VertexConfiguration[] = [
  { name: 'sun', corners: [K(0), K(0), K(0), K(0), K(0)] },
  { name: 'star', corners: [D(0), D(0), D(0), D(0), D(0)] },
  { name: 'ace', corners: [D(2), K(1), K(3)] },
  { name: 'deuce', corners: [D(1), D(3), K(2), K(2)] },
  { name: 'jack', corners: [D(1), K(0), K(0), D(3), K(2)] },
  { name: 'queen', corners: [D(0), K(3), K(1), K(3), K(1)] },
  { name: 'king', corners: [D(0), D(0), D(0), K(3), K(1)] },
];

export const P2: TileSet = {
  id: 'P2',
  kinds: ['kite', 'dart'],
  shapes: { kite, dart },
  vertexAtlas,
  cornersMatch: (a, b) => a === b,
  edgesMatch: (a, b) => a === b,
};

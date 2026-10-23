import { describe, expect, it } from 'vitest';
import { compareWithBest } from '../../src/storage/best';

describe('personal best', () => {
  it('the first finished game is the personal best', () => {
    const c = compareWithBest(null, { tiles: 10, area: 12.5 });
    expect(c).toEqual({ previous: null, best: { tiles: 10, area: 12.5 }, isNewBest: true });
  });

  it('a larger area beats the best, whatever the tile count', () => {
    const c = compareWithBest({ tiles: 20, area: 25 }, { tiles: 18, area: 26 });
    expect(c.isNewBest).toBe(true);
    expect(c.best).toEqual({ tiles: 18, area: 26 });
    expect(c.previous).toEqual({ tiles: 20, area: 25 });
  });

  it('a smaller or equal area keeps the old best', () => {
    for (const area of [10, 25]) {
      const c = compareWithBest({ tiles: 20, area: 25 }, { tiles: 30, area });
      expect(c.isNewBest).toBe(false);
      expect(c.best).toEqual({ tiles: 20, area: 25 });
    }
  });
});

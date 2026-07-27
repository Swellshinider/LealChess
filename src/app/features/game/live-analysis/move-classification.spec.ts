import { describe, expect, it } from 'vitest';
import { classifyLiveMove, type ClassificationInput } from './move-classification';

const base: ClassificationInput = {
  book: false,
  playedBestMove: false,
  bestExpectedPoints: 0.65,
  playedExpectedPoints: 0.65,
  secondBestExpectedPoints: 0.64,
  soundSacrifice: false,
};

describe('classifyLiveMove', () => {
  it('uses the special-classification precedence', () => {
    expect(classifyLiveMove({ ...base, book: true })).toBe('book');
    expect(
      classifyLiveMove({
        ...base,
        playedBestMove: true,
        soundSacrifice: true,
        playedExpectedPoints: 0.63,
      }),
    ).toBe('brilliant');
    expect(
      classifyLiveMove({
        ...base,
        playedBestMove: true,
        secondBestExpectedPoints: 0.55,
      }),
    ).toBe('great');
    expect(classifyLiveMove({ ...base, playedBestMove: true })).toBe('best');
    expect(
      classifyLiveMove({
        ...base,
        bestExpectedPoints: 0.7,
        playedExpectedPoints: 0.55,
      }),
    ).toBe('miss');
  });

  it.each([
    [0.02, 'excellent'],
    [0.020_001, 'good'],
    [0.05, 'good'],
    [0.050_001, 'inaccuracy'],
    [0.1, 'inaccuracy'],
    [0.100_001, 'mistake'],
    [0.2, 'mistake'],
    [0.200_001, 'blunder'],
  ] as const)('classifies an expected-points loss of %s as %s', (loss, expected) => {
    expect(
      classifyLiveMove({
        ...base,
        bestExpectedPoints: 0.65,
        playedExpectedPoints: 0.65 - loss,
      }),
    ).toBe(expected);
  });
});

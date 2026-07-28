import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { isOpeningPosition, openingBookPlyCount } from './opening-index';

describe('opening index', () => {
  it('keeps a main opening line in book until the first unknown position', () => {
    const chess = new Chess();
    const positions = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'h5'].map((san) => {
      chess.move(san);
      return chess.fen();
    });

    expect(positions.slice(0, 7).every(isOpeningPosition)).toBe(true);
    expect(isOpeningPosition(positions[7]!)).toBe(false);
    expect(openingBookPlyCount(positions)).toBe(7);
  });
});

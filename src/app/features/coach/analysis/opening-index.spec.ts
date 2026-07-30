import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { detectOpening, isOpeningPosition, openingBookPlyCount } from './opening-index';

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

  it('detects the deepest named opening before the game leaves theory', () => {
    const chess = new Chess();
    const positions = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'h5'].map((san) => {
      chess.move(san);
      return chess.fen();
    });

    expect(detectOpening(new Chess().fen(), positions)).toEqual({
      eco: 'C70',
      name: 'Ruy Lopez: Morphy Defense',
    });
  });

  it('detects transposed positions and rejects games from custom starting positions', () => {
    const chess = new Chess();
    const positions = ['Nf3', 'd5', 'g3', 'c5', 'Bg2', 'Nc6', 'O-O', 'e5'].map((san) => {
      chess.move(san);
      return chess.fen();
    });

    expect(detectOpening(new Chess().fen(), positions)?.name).toBeTruthy();
    expect(detectOpening(positions[0], positions)).toBeUndefined();
    expect(detectOpening(new Chess().fen(), [])).toBeUndefined();
  });
});

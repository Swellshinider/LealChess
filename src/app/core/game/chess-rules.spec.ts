import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

describe('authoritative chess.js rules', () => {
  it('rejects illegal moves without changing the position', () => {
    const chess = new Chess();
    const before = chess.fen();
    expect(() => chess.move({ from: 'e2', to: 'e5' })).toThrow();
    expect(chess.fen()).toBe(before);
  });

  it('handles castling', () => {
    const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const move = chess.move({ from: 'e1', to: 'g1' });
    expect(move.isKingsideCastle()).toBe(true);
    expect(chess.get('f1')?.type).toBe('r');
  });

  it('handles en passant', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('a6');
    chess.move('e5');
    chess.move('d5');
    const move = chess.move({ from: 'e5', to: 'd6' });
    expect(move.isEnPassant()).toBe(true);
    expect(chess.get('d5')).toBeUndefined();
  });

  it('requires and applies a promotion piece', () => {
    const chess = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const move = chess.move({ from: 'a7', to: 'a8', promotion: 'n' });
    expect(move.isPromotion()).toBe(true);
    expect(chess.get('a8')?.type).toBe('n');
  });

  it('detects checkmate, stalemate, and insufficient material', () => {
    expect(new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1').isCheckmate()).toBe(true);
    expect(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').isStalemate()).toBe(true);
    expect(new Chess('8/8/8/8/8/8/2k5/4K3 w - - 0 1').isInsufficientMaterial()).toBe(true);
  });

  it('detects threefold repetition and the fifty-move rule', () => {
    const repetition = new Chess();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      repetition.move('Nf3');
      repetition.move('Nf6');
      repetition.move('Ng1');
      repetition.move('Ng8');
    }
    expect(repetition.isThreefoldRepetition()).toBe(true);
    expect(new Chess('7k/8/8/8/8/8/6R1/K7 w - - 100 51').isDrawByFiftyMoves()).toBe(true);
  });
});

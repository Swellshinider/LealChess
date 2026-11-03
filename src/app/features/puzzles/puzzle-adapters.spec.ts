import { describe, expect, it } from 'vitest';
import {
  normalizeChessComDaily,
  normalizeLichessDaily,
  pgnMainlineToUci,
  validateLine,
} from './puzzle-adapters';

describe('puzzle provider adapters', () => {
  it('normalizes a Lichess daily puzzle at its initial ply', () => {
    const puzzle = normalizeLichessDaily({
      game: { pgn: '1. e4 e5 2. Nf3 Nc6' },
      puzzle: {
        id: 'abc123',
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        initialPly: 2,
        rating: 1400,
        themes: ['fork'],
        solution: ['g1f3', 'b8c6'],
      },
    });
    expect(puzzle.source).toBe('lichess');
    expect(puzzle.fen).toContain(' w ');
    expect(puzzle.solution).toEqual(['g1f3', 'b8c6']);
  });

  it('converts a Chess.com PGN mainline to UCI', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(pgnMainlineToUci(fen, '1. e4 e5 2. Nf3')).toEqual(['e2e4', 'e7e5', 'g1f3']);
    const puzzle = normalizeChessComDaily({
      fen,
      pgn: '1. d4 d5',
      title: 'Daily',
      url: 'https://www.chess.com/puzzles/problem/42',
      publish_time: 1_700_000_000,
    });
    expect(puzzle.key).toBe('42');
    expect(puzzle.solution).toEqual(['d2d4', 'd7d5']);
  });

  it('rejects unknown or illegal responses', () => {
    expect(() => normalizeChessComDaily({})).toThrow();
    expect(() => validateLine('8/8/8/8/8/8/8/K6k w - - 0 1', ['a1a8'])).toThrow('Illegal');
  });
});

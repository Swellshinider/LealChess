import { describe, expect, it } from 'vitest';
import { parseImportedPgn } from './pgn-parser';

const sample = `[Event "Study"]
[Result "1-0"]

1. e4 {A comment} e5 2. Nf3 Nc6 1-0`;

describe('parseImportedPgn', () => {
  it('records SAN, colors, UCI, and every FEN transition', () => {
    const result = parseImportedPgn(sample);
    expect(result.status).toBe('ready');
    expect(result.moves.map((move) => [move.ply, move.color, move.san, move.uci])).toEqual([
      [1, 'white', 'e4', 'e2e4'],
      [2, 'black', 'e5', 'e7e5'],
      [3, 'white', 'Nf3', 'g1f3'],
      [4, 'black', 'Nc6', 'b8c6'],
    ]);
    expect(result.moves[0]?.fenBefore).toContain('rnbqkbnr');
    expect(result.moves[0]?.fenAfter).toContain('4P3');
  });

  it('respects a custom starting FEN and accepts an empty game', () => {
    const custom = `[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]
[Result "*"]

1. e4 *`;
    expect(parseImportedPgn(custom).moves[0]?.fenBefore).toContain('4P3');
    expect(parseImportedPgn('[Result "*"]\n\n*')).toMatchObject({
      status: 'ready',
      moves: [],
    });
  });

  it('keeps precise failures for invalid PGNs and unsupported variants', () => {
    expect(parseImportedPgn('1. ThisIsNotAMove').status).toBe('invalid-pgn');
    expect(parseImportedPgn(sample, 'chess960')).toEqual({
      status: 'unsupported-variant',
      moves: [],
      error: 'Replay is unavailable for the chess960 variant.',
    });
  });
});

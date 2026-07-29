import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { candidateLines, legalDestinations, parseUci } from './chess-move';

describe('chess move helpers', () => {
  it('parses complete UCI moves and rejects malformed input', () => {
    expect(parseUci('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseUci('e2e9')).toBeNull();
  });

  it('groups legal destinations without duplicates', () => {
    const destinations = legalDestinations(new Chess());
    expect(destinations.get('e2')).toEqual(['e3', 'e4']);
  });

  it('converts principal variations to legal SAN lines', () => {
    const evaluation = { depth: 10, score: { kind: 'centipawn' as const, value: 20 } };
    expect(
      candidateLines(
        new Chess().fen(),
        {
          bestMove: { from: 'e2', to: 'e4' },
          evaluation,
          principalVariation: ['e2e4', 'e7e5'],
        },
        2,
      )[0],
    ).toMatchObject({ firstMove: { from: 'e2', to: 'e4' }, san: ['e4', 'e5'] });
  });
});

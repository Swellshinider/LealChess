import { describe, expect, it } from 'vitest';
import type { ImportedGame } from '../domain/coach.types';
import { calculateImportSummary } from './import-summary';

function game(
  key: string,
  white: string,
  black: string,
  result: string,
  opening?: string,
): ImportedGame {
  return {
    key,
    platform: key.startsWith('lichess') ? 'lichess' : 'chess-com',
    platformGameId: key,
    platformUrl: '',
    pgn: '',
    variant: 'standard',
    white: { username: white },
    black: { username: black },
    result,
    speed: 'rapid',
    timeControl: '600',
    rated: true,
    endTime: '2026-07-24T12:00:00.000Z',
    ...(opening ? { opening: { name: opening } } : {}),
    moves: [],
    parseStatus: 'ready',
    profileKeys: [],
    firstImportedAt: '',
    lastImportedAt: '',
  };
}

describe('calculateImportSummary', () => {
  it('calculates both colors, draws, losses, and opening frequency for the learner', () => {
    const summary = calculateImportSummary(
      [
        game('chess-com:1', 'Learner', 'A', '1-0', 'Sicilian Defense'),
        game('chess-com:2', 'B', 'Learner', '1-0', 'French Defense'),
        game('lichess:3', 'C', 'Learner', '1/2-1/2', 'Sicilian Defense'),
        game('lichess:4', 'Learner', 'D', '0-1'),
      ],
      { 'chess-com': 'learner', lichess: 'LEARNER' },
    );
    expect(summary).toMatchObject({
      total: 4,
      wins: 1,
      draws: 1,
      losses: 2,
      asWhite: { wins: 1, draws: 0, losses: 1 },
      asBlack: { wins: 0, draws: 1, losses: 1 },
    });
    expect(summary.topOpenings[0]).toMatchObject({ name: 'Sicilian Defense', count: 2 });
  });

  it('includes local games using their explicit learner color', () => {
    const local = {
      ...game('chess-com:local', 'Stockfish', 'You', '0-1'),
      key: 'local:game',
      platform: 'local' as const,
      learnerColor: 'black' as const,
    };

    expect(calculateImportSummary([local], {})).toMatchObject({
      total: 1,
      wins: 1,
      asBlack: { wins: 1 },
    });
  });
});

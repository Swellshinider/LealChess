import { describe, expect, it } from 'vitest';
import type { GameAnalysis, ImportedGame, ImportedProfile } from '../domain/coach.types';
import { selectGamesForBatchAnalysis } from './batch-analysis-selection';

const profiles: ImportedProfile[] = [
  {
    platform: 'chess-com',
    username: 'Learner',
    displayName: 'Learner',
    profileUrl: '',
    updatedAt: '',
  },
];

function game(key: string, options: Partial<ImportedGame> = {}): ImportedGame {
  return {
    key,
    platform: 'chess-com',
    platformGameId: key,
    platformUrl: '',
    pgn: '',
    variant: 'standard',
    white: { username: 'Learner' },
    black: { username: 'Opponent' },
    result: '1-0',
    speed: 'rapid',
    timeControl: '600',
    rated: true,
    endTime: '2026-07-24T12:00:00.000Z',
    moves: [
      {
        ply: 1,
        color: 'white',
        san: 'e4',
        from: 'e2',
        to: 'e4',
        uci: 'e2e4',
        fenBefore: 'start',
        fenAfter: 'after',
      },
    ],
    parseStatus: 'ready',
    profileKeys: ['chess-com:learner'],
    firstImportedAt: '',
    lastImportedAt: '',
    ...options,
  };
}

function analysis(gameKey: string, status: GameAnalysis['status'] = 'complete'): GameAnalysis {
  return {
    importedGameKey: gameKey,
    schemaVersion: 5,
    sourceFingerprint: 'fp',
    engineVersion: 'stockfish-18-single@18.0.8',
    depth: 16,
    learnerColor: 'white',
    status,
    totalUserMoves: 1,
    moves: [],
    reviewMoves: [],
    updatedAt: '',
  };
}

describe('selectGamesForBatchAnalysis', () => {
  it('preserves newest-first order and caps at count', () => {
    const games = [game('new'), game('mid'), game('old')];
    expect(selectGamesForBatchAnalysis(games, profiles, [], 2).map((g) => g.key)).toEqual([
      'new',
      'mid',
    ]);
  });

  it('excludes games that cannot be replayed', () => {
    const games = [game('ready'), game('broken', { parseStatus: 'invalid-pgn' })];
    expect(selectGamesForBatchAnalysis(games, profiles, [], 5).map((g) => g.key)).toEqual([
      'ready',
    ]);
  });

  it('excludes games without moves', () => {
    const games = [game('ready'), game('empty', { moves: [] })];
    expect(selectGamesForBatchAnalysis(games, profiles, [], 5).map((g) => g.key)).toEqual([
      'ready',
    ]);
  });

  it('excludes games with no resolvable learner color', () => {
    const games = [
      game('ready'),
      game('unknown', { white: { username: 'Nobody' }, black: { username: 'Nobody Else' } }),
    ];
    expect(selectGamesForBatchAnalysis(games, profiles, [], 5).map((g) => g.key)).toEqual([
      'ready',
    ]);
  });

  it('excludes games already fully analyzed but includes partially analyzed games', () => {
    const games = [game('done'), game('partial'), game('untouched')];
    const analyses = [analysis('done', 'complete'), analysis('partial', 'partial')];
    expect(selectGamesForBatchAnalysis(games, profiles, analyses, 5).map((g) => g.key)).toEqual([
      'partial',
      'untouched',
    ]);
  });
});

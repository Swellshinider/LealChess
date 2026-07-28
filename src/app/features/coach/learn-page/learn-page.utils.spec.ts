import { describe, expect, it } from 'vitest';
import type { ImportedGame, ImportedProfile } from '../domain/coach.types';
import {
  DEFAULT_LEARN_GAME_FILTERS,
  availableGameSpeeds,
  filterAndSortGames,
  learnerOutcome,
  ratingSeriesForGames,
} from './learn-page.utils';

const profiles: ImportedProfile[] = [
  {
    platform: 'chess-com',
    username: 'Learner',
    displayName: 'Learner',
    profileUrl: '',
    updatedAt: '',
  },
  {
    platform: 'lichess',
    username: 'Student',
    displayName: 'Student',
    profileUrl: '',
    updatedAt: '',
  },
];

function game(
  key: string,
  options: {
    platform?: ImportedGame['platform'];
    date?: string;
    learner?: 'white' | 'black';
    result?: string;
    speed?: string;
    rating?: number;
  } = {},
): ImportedGame {
  const platform = options.platform ?? 'chess-com';
  const learnerName =
    platform === 'chess-com' ? 'Learner' : platform === 'lichess' ? 'Student' : 'You';
  const learner = options.learner ?? 'white';
  const learnerPlayer = { username: learnerName, rating: options.rating ?? 1500 };
  const opponent = { username: 'Opponent', rating: 1480 };
  return {
    key,
    platform,
    platformGameId: key,
    platformUrl: '',
    pgn: '',
    variant: 'standard',
    white: learner === 'white' ? learnerPlayer : opponent,
    black: learner === 'black' ? learnerPlayer : opponent,
    result: options.result ?? '1-0',
    speed: options.speed ?? 'rapid',
    timeControl: '600',
    rated: true,
    endTime: options.date ?? '2026-07-24T12:00:00.000Z',
    moves: [],
    parseStatus: 'ready',
    profileKeys: [],
    firstImportedAt: '',
    lastImportedAt: '',
    ...(platform === 'local' ? { learnerColor: learner } : {}),
  };
}

describe('learn page helpers', () => {
  it('finds wins, draws, and losses from the learner perspective', () => {
    expect(learnerOutcome(game('win'), profiles)).toBe('win');
    expect(learnerOutcome(game('draw', { result: '1/2-1/2' }), profiles)).toBe('draw');
    expect(learnerOutcome(game('loss', { learner: 'black', result: '1-0' }), profiles)).toBe(
      'loss',
    );
  });

  it('combines result, platform, and speed filters and sorts oldest first', () => {
    const games = [
      game('new-win', { date: '2026-07-25T12:00:00.000Z' }),
      game('old-loss', {
        date: '2026-07-20T12:00:00.000Z',
        learner: 'black',
        result: '1-0',
        speed: 'blitz',
      }),
      game('lichess-loss', {
        platform: 'lichess',
        date: '2026-07-22T12:00:00.000Z',
        result: '0-1',
      }),
    ];
    expect(
      filterAndSortGames(games, profiles, {
        result: 'loss',
        platform: 'chess-com',
        speed: 'blitz',
        sort: 'oldest',
      }).map((candidate) => candidate.key),
    ).toEqual(['old-loss']);
    expect(
      filterAndSortGames(games, profiles, DEFAULT_LEARN_GAME_FILTERS).map(
        (candidate) => candidate.key,
      ),
    ).toEqual(['new-win', 'lichess-loss', 'old-loss']);
  });

  it('filters local games and determines their outcome without an imported profile', () => {
    const local = game('local:game', {
      platform: 'local',
      learner: 'black',
      result: '0-1',
      speed: 'untimed',
    });

    expect(learnerOutcome(local, profiles)).toBe('win');
    expect(
      filterAndSortGames([game('imported'), local], profiles, {
        ...DEFAULT_LEARN_GAME_FILTERS,
        platform: 'local',
      }),
    ).toEqual([local]);
  });

  it('returns available speeds in a useful order', () => {
    expect(
      availableGameSpeeds([
        game('daily', { speed: 'daily' }),
        game('rapid'),
        game('blitz', { speed: 'blitz' }),
      ]),
    ).toEqual(['blitz', 'rapid', 'daily']);
  });

  it('builds independent chronological rating series and skips missing ratings', () => {
    const games = [
      game('chess-new', { date: '2026-07-25T12:00:00.000Z', rating: 1540 }),
      game('chess-old', { date: '2026-07-20T12:00:00.000Z', rating: 1500 }),
      game('lichess', {
        platform: 'lichess',
        date: '2026-07-22T12:00:00.000Z',
        rating: 1620,
      }),
      game('missing', { date: '2026-07-26T12:00:00.000Z', rating: Number.NaN }),
    ];
    const series = ratingSeriesForGames(games, profiles);
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({
      platform: 'chess-com',
      firstRating: 1500,
      latestRating: 1540,
      change: 40,
    });
    expect(series[0].points.map((point) => point.rating)).toEqual([1500, 1540]);
    expect(series[1]).toMatchObject({
      platform: 'lichess',
      firstRating: 1620,
      latestRating: 1620,
      change: 0,
    });
  });
});

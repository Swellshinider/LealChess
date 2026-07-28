import { learnerColorForGame } from '../analysis/analysis-rules';
import type { ChessPlatform, ImportedGame, ImportedProfile } from '../domain/coach.types';

export type LearnGameOutcome = 'win' | 'draw' | 'loss' | 'unknown';
export type LearnGameResultFilter = 'all' | Exclude<LearnGameOutcome, 'unknown'>;
export type LearnGameSort = 'newest' | 'oldest';

export interface LearnGameFilters {
  result: LearnGameResultFilter;
  platform: 'all' | ChessPlatform;
  speed: string;
  sort: LearnGameSort;
}

export interface RatingPoint {
  date: string;
  rating: number;
  timestamp: number;
}

export interface RatingSeries {
  platform: ChessPlatform;
  label: string;
  points: RatingPoint[];
  firstRating: number;
  latestRating: number;
  change: number;
}

export const DEFAULT_LEARN_GAME_FILTERS: LearnGameFilters = {
  result: 'all',
  platform: 'all',
  speed: 'all',
  sort: 'newest',
};

export function learnerOutcome(
  game: ImportedGame,
  profiles: readonly ImportedProfile[],
): LearnGameOutcome {
  const color = learnerColorForGame(game, [...profiles]);
  if (!color) return 'unknown';
  if (game.result === '1/2-1/2' || game.result === '½-½' || game.result === '*') return 'draw';
  return (game.result === '1-0') === (color === 'white') ? 'win' : 'loss';
}

export function filterAndSortGames(
  games: readonly ImportedGame[],
  profiles: readonly ImportedProfile[],
  filters: LearnGameFilters,
): ImportedGame[] {
  return games
    .filter((game) => filters.result === 'all' || learnerOutcome(game, profiles) === filters.result)
    .filter((game) => filters.platform === 'all' || game.platform === filters.platform)
    .filter((game) => filters.speed === 'all' || game.speed === filters.speed)
    .sort((left, right) => {
      const comparison = left.endTime.localeCompare(right.endTime);
      return filters.sort === 'newest' ? -comparison : comparison;
    });
}

export function availableGameSpeeds(games: readonly ImportedGame[]): string[] {
  const preferredOrder = ['bullet', 'blitz', 'rapid', 'classical', 'daily', 'correspondence'];
  return [...new Set(games.map((game) => game.speed))].filter(Boolean).sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left);
    const rightIndex = preferredOrder.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

export function ratingSeriesForGames(
  games: readonly ImportedGame[],
  profiles: readonly ImportedProfile[],
): RatingSeries[] {
  return (['chess-com', 'lichess'] as const).flatMap((platform) => {
    const profile = profiles.find((candidate) => candidate.platform === platform);
    if (!profile) return [];

    const points = games
      .filter((game) => game.platform === platform)
      .flatMap((game): RatingPoint[] => {
        const color = learnerColorForGame(game, [profile]);
        const rating = color ? game[color].rating : undefined;
        const timestamp = Date.parse(game.endTime);
        if (rating === undefined || !Number.isFinite(rating) || Number.isNaN(timestamp)) return [];
        return [{ date: game.endTime, rating, timestamp }];
      })
      .sort((left, right) => left.timestamp - right.timestamp);

    if (!points.length) return [];
    const firstRating = points[0].rating;
    const latestRating = points.at(-1)?.rating ?? firstRating;
    return [
      {
        platform,
        label: platform === 'chess-com' ? 'Chess.com' : 'Lichess',
        points,
        firstRating,
        latestRating,
        change: latestRating - firstRating,
      },
    ];
  });
}

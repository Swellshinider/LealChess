export type PuzzleSource = 'lichess' | 'chess-com' | 'lichess-catalog';
export type PuzzleOutcome = 'clean-solved' | 'completed-with-errors' | 'assisted' | 'revealed';

export interface Puzzle {
  readonly source: PuzzleSource;
  readonly key: string;
  readonly fen: string;
  readonly solution: readonly string[];
  readonly externalUrl: string;
  readonly title?: string;
  readonly rating?: number;
  readonly date?: string;
  readonly themes: readonly string[];
  readonly openings: readonly string[];
}

export interface CachedDailyPuzzle {
  readonly id: string;
  readonly provider: 'lichess' | 'chess-com';
  readonly fetchedDate: string;
  readonly fetchedAt: string;
  readonly puzzle: Puzzle;
}

export interface PuzzleAttempt {
  readonly id: string;
  readonly puzzleKey: string;
  readonly source: PuzzleSource;
  readonly outcome: PuzzleOutcome;
  readonly mistakes: number;
  readonly hintLevel: 0 | 1 | 2;
  readonly rating?: number;
  readonly themes: readonly string[];
  readonly openings: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly dailyDate?: string;
  readonly dailyCredit: boolean;
}

export interface PuzzleStats {
  readonly total: number;
  readonly clean: number;
  readonly cleanRate: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
}

export interface CompactPuzzleCatalog {
  readonly version: 1;
  readonly generatedAt: string;
  readonly sourceDate: string;
  readonly sourceSha256: string;
  readonly strings: readonly string[];
  /** [id, fen, solution, rating, themes, openings] with string-table indexes. */
  readonly puzzles: readonly (readonly [
    number,
    number,
    number,
    number,
    readonly number[],
    readonly number[],
  ])[];
  readonly ratingBounds: readonly [number, number];
  readonly tagIndexes: Readonly<Record<string, readonly number[]>>;
}

export function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

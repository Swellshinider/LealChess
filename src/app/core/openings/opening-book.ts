import type { OpeningInfo } from './opening.types';

const STANDARD_INITIAL_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

export interface OpeningBook {
  /** True when the position is still inside the known opening book. */
  isOpeningPosition(fen: string): boolean;
  /** How many leading plies of a game stay inside the book. */
  openingBookPlyCount(fens: readonly string[]): number;
  /** The most specific named opening reached, for games starting from the standard position. */
  detectOpening(initialFen: string | undefined, fens: readonly string[]): OpeningInfo | undefined;
}

let pending: Promise<OpeningBook> | null = null;

/**
 * Loads the generated opening index on first use and caches it for the rest of the session.
 *
 * The index is roughly 900 kB of generated data, so it is deliberately kept out of the route
 * chunks that consult it and pulled in only when analysis actually needs it. Await this once per
 * operation rather than per position; the returned lookups are synchronous.
 */
export function loadOpeningBook(): Promise<OpeningBook> {
  pending ??= import('./opening-positions.generated').then(buildOpeningBook);
  return pending;
}

function buildOpeningBook(data: {
  OPENING_POSITION_DATA: string;
  OPENING_NAME_DATA: string;
}): OpeningBook {
  const positions = new Set(data.OPENING_POSITION_DATA.split('\n'));
  const byPosition = new Map(
    data.OPENING_NAME_DATA.split('\n').map((row) => {
      const [position, eco, name] = row.split('\t');
      return [position, { eco, name }] as const;
    }),
  );

  const isOpeningPosition = (fen: string): boolean => positions.has(positionKey(fen));

  return {
    isOpeningPosition,
    openingBookPlyCount(fens) {
      const firstNonBookIndex = fens.findIndex((fen) => !isOpeningPosition(fen));
      return firstNonBookIndex === -1 ? fens.length : firstNonBookIndex;
    },
    detectOpening(initialFen, fens) {
      if (!initialFen || positionKey(initialFen) !== STANDARD_INITIAL_POSITION) return undefined;
      for (let index = fens.length - 1; index >= 0; index -= 1) {
        const opening = byPosition.get(positionKey(fens[index]!));
        if (opening?.name) return opening;
      }
      return undefined;
    },
  };
}

function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

import type { OpeningInfo } from '../domain/coach.types';
import { OPENING_NAME_DATA, OPENING_POSITION_DATA } from './opening-positions.generated';

const OPENING_POSITIONS = new Set(OPENING_POSITION_DATA.split('\n'));
const OPENINGS_BY_POSITION = new Map(
  OPENING_NAME_DATA.split('\n').map((row) => {
    const [position, eco, name] = row.split('\t');
    return [position, { eco, name }] as const;
  }),
);
const STANDARD_INITIAL_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

export function isOpeningPosition(fen: string): boolean {
  return OPENING_POSITIONS.has(positionKey(fen));
}

export function openingBookPlyCount(fens: readonly string[]): number {
  const firstNonBookIndex = fens.findIndex((fen) => !isOpeningPosition(fen));
  return firstNonBookIndex === -1 ? fens.length : firstNonBookIndex;
}

export function detectOpening(
  initialFen: string | undefined,
  fens: readonly string[],
): OpeningInfo | undefined {
  if (!initialFen || positionKey(initialFen) !== STANDARD_INITIAL_POSITION) return undefined;
  for (let index = fens.length - 1; index >= 0; index -= 1) {
    const opening = OPENINGS_BY_POSITION.get(positionKey(fens[index]!));
    if (opening?.name) return opening;
  }
  return undefined;
}

function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

import { OPENING_POSITION_DATA } from './opening-positions.generated';

const OPENING_POSITIONS = new Set(OPENING_POSITION_DATA.split('\n'));

export function isOpeningPosition(fen: string): boolean {
  return OPENING_POSITIONS.has(positionKey(fen));
}

export function openingBookPlyCount(fens: readonly string[]): number {
  const firstNonBookIndex = fens.findIndex((fen) => !isOpeningPosition(fen));
  return firstNonBookIndex === -1 ? fens.length : firstNonBookIndex;
}

function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

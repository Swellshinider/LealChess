// Compact position index derived from the CC0 lichess-org/chess-openings dataset.
const OPENING_POSITIONS = new Set([
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -',
  'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -',
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -',
]);

export function isOpeningPosition(fen: string): boolean {
  return OPENING_POSITIONS.has(fen.split(' ').slice(0, 4).join(' '));
}

import type { Chess } from 'chess.js';
import { chessColor, oppositeChessColor } from './chess-move';
import { capitalize } from './game-presentation';
import type { GameResult } from './game.types';

export function evaluateAutomaticResult(chess: Chess): GameResult | null {
  if (chess.isCheckmate()) {
    const winner = oppositeChessColor(chessColor(chess.turn()));
    return { winner, reason: 'checkmate', label: `${capitalize(winner)} wins by checkmate` };
  }
  if (chess.isStalemate()) {
    return { winner: null, reason: 'stalemate', label: 'Draw by stalemate' };
  }
  if (chess.isInsufficientMaterial()) {
    return {
      winner: null,
      reason: 'insufficient-material',
      label: 'Draw by insufficient material',
    };
  }
  return null;
}

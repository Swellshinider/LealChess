import { Chess } from 'chess.js';
import type { PersistedGame } from '../persistence/persistence.types';

export function validatedPersistedChess(game: PersistedGame): Chess | null {
  try {
    const candidate = new Chess();
    candidate.loadPgn(game.pgn);
    const history = candidate.history({ verbose: true });
    const consistent =
      candidate.fen() === game.fen &&
      history.length === game.moves.length &&
      history.every((move, index) => move.lan === game.moves[index]?.lan);
    return consistent ? candidate : null;
  } catch {
    return null;
  }
}

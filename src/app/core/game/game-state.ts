import type { Chess } from 'chess.js';
import { chessColor, legalDestinations } from './chess-move';
import { moveRecords } from './game-presentation';
import { DEFAULT_PREFERENCES, type GameViewState } from './game.types';

export function buildGameViewState(
  chess: Chess,
  previous?: GameViewState,
  changes: Partial<GameViewState> = {},
): GameViewState {
  const playerColor = changes.playerColor ?? previous?.playerColor ?? 'white';
  const preferences = changes.preferences ?? previous?.preferences ?? { ...DEFAULT_PREFERENCES };
  const turn = chessColor(chess.turn());
  const history = chess.history({ verbose: true });
  const last = history.at(-1);
  const result = changes.result === undefined ? (previous?.result ?? null) : changes.result;
  const phase = changes.phase ?? previous?.phase ?? 'setup';

  return {
    gameId: changes.gameId ?? previous?.gameId ?? 'setup',
    phase,
    engineStatus: changes.engineStatus ?? previous?.engineStatus ?? 'idle',
    engineError:
      changes.engineError === undefined ? (previous?.engineError ?? null) : changes.engineError,
    fen: chess.fen(),
    pgn: chess.pgn(),
    moves: moveRecords(history),
    playerColor,
    turn,
    orientation: changes.orientation ?? previous?.orientation ?? preferences.orientation,
    difficulty: changes.difficulty ?? previous?.difficulty ?? preferences.difficulty,
    pendingPremove:
      changes.pendingPremove === undefined
        ? (previous?.pendingPremove ?? null)
        : changes.pendingPremove,
    result,
    lastMove: last ? [last.from, last.to] : null,
    checkSquare: chess.inCheck()
      ? (chess.findPiece({ type: 'k', color: chess.turn() })[0] ?? null)
      : null,
    canClaimDraw:
      phase === 'active' &&
      !result &&
      (chess.isThreefoldRepetition() || chess.isDrawByFiftyMoves()),
    isPlayerTurn: phase === 'active' && !result && turn === playerColor,
    restored: changes.restored ?? previous?.restored ?? false,
    announcement: changes.announcement ?? previous?.announcement ?? '',
    preferences,
    legalDestinations: legalDestinations(
      chess,
      turn === playerColor && phase === 'active' && !result,
    ),
  };
}

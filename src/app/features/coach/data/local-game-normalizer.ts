import type { GameViewState } from '../../../core/game/game.types';
import type { ImportedGame } from '../domain/coach.types';

export function normalizeLocalGame(
  state: GameViewState,
  completedAt = new Date().toISOString(),
): ImportedGame {
  if (state.phase !== 'game-over' || !state.result) {
    throw new Error('Only completed games can be reviewed.');
  }

  return {
    key: `local:${state.gameId}`,
    platform: 'local',
    platformGameId: state.gameId,
    platformUrl: '',
    pgn: state.pgn,
    variant: 'standard',
    white: { username: state.playerColor === 'white' ? 'You' : 'Stockfish' },
    black: { username: state.playerColor === 'black' ? 'You' : 'Stockfish' },
    result: resultTag(state),
    speed: 'untimed',
    timeControl: 'No clock',
    rated: false,
    endTime: completedAt,
    moves: state.moves.map((move) => ({
      ply: move.ply,
      color: move.color,
      san: move.san,
      from: move.from,
      to: move.to,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      fenBefore: move.before,
      fenAfter: move.after,
    })),
    parseStatus: 'ready',
    profileKeys: [],
    firstImportedAt: completedAt,
    lastImportedAt: completedAt,
    learnerColor: state.playerColor,
  };
}

function resultTag(state: GameViewState): string {
  if (!state.result?.winner) return '1/2-1/2';
  return state.result.winner === 'white' ? '1-0' : '0-1';
}

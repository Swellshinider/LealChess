import { describe, expect, it } from 'vitest';
import type { GameViewState } from '../../../core/game/game.types';
import { DEFAULT_PREFERENCES, STARTING_FEN } from '../../../core/game/game.types';
import { normalizeLocalGame } from './local-game-normalizer';

describe('normalizeLocalGame', () => {
  it('creates a replayable archive game from a completed local game', () => {
    const game = normalizeLocalGame(
      state({
        playerColor: 'black',
        result: { winner: 'black', reason: 'checkmate', label: 'Black wins by checkmate' },
      }),
      '2026-07-28T12:00:00.000Z',
    );

    expect(game).toMatchObject({
      key: 'local:local-game',
      platform: 'local',
      platformGameId: 'local-game',
      white: { username: 'Stockfish', rating: 1500 },
      black: { username: 'You' },
      result: '0-1',
      speed: 'untimed',
      timeControl: 'No clock',
      endTime: '2026-07-28T12:00:00.000Z',
      learnerColor: 'black',
      botRating: 1500,
      parseStatus: 'ready',
    });
    expect(game.moves[0]).toMatchObject({
      color: 'white',
      san: 'e4',
      uci: 'e2e4q',
      fenBefore: STARTING_FEN,
      fenAfter: 'after-e4',
    });
  });

  it('maps draws and rejects games that are still active', () => {
    expect(
      normalizeLocalGame(
        state({
          result: { winner: null, reason: 'stalemate', label: 'Draw by stalemate' },
        }),
      ).result,
    ).toBe('1/2-1/2');
    expect(() => normalizeLocalGame(state({ phase: 'active', result: null }))).toThrow(
      'Only completed games can be reviewed.',
    );
  });
});

function state(changes: Partial<GameViewState> = {}): GameViewState {
  return {
    gameId: 'local-game',
    phase: 'game-over',
    engineStatus: 'ready',
    engineError: null,
    fen: 'after-e4',
    pgn: '1. e4 1-0',
    moves: [
      {
        ply: 1,
        color: 'white',
        from: 'e2',
        to: 'e4',
        san: 'e4',
        lan: 'e2e4',
        piece: 'p',
        promotion: 'q',
        before: STARTING_FEN,
        after: 'after-e4',
      },
    ],
    playerColor: 'white',
    turn: 'black',
    orientation: 'white',
    botRating: 1500,
    pendingPremove: null,
    result: { winner: 'white', reason: 'checkmate', label: 'White wins by checkmate' },
    lastMove: ['e2', 'e4'],
    checkSquare: null,
    canClaimDraw: false,
    isPlayerTurn: false,
    restored: false,
    announcement: '',
    preferences: { ...DEFAULT_PREFERENCES },
    legalDestinations: new Map(),
    ...changes,
  };
}

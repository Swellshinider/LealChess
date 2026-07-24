import { describe, expect, it } from 'vitest';
import { normalizeChessComGame } from './chess-com-normalizer';
import { normalizeLichessGame } from './lichess-normalizer';

const pgn = `[White "Learner"]
[Black "Opponent"]
[WhiteElo "1500"]
[BlackElo "1490"]
[Result "1-0"]
[ECO "C20"]
[Opening "King's Pawn Game"]

1. e4 e5 1-0`;
const importedAt = '2026-07-24T12:00:00.000Z';

describe('platform normalizers', () => {
  it('normalizes Chess.com IDs, players, ratings, result, opening, and timestamp', () => {
    const game = normalizeChessComGame(
      {
        url: 'https://www.chess.com/game/live/123456',
        uuid: 'fallback',
        pgn,
        time_class: 'rapid',
        time_control: '600+5',
        end_time: 1_721_822_400,
        rated: true,
        white: { username: 'Learner', rating: 1500, result: 'win' },
        black: { username: 'Opponent', result: 'checkmated' },
      },
      'chess-com:learner',
      importedAt,
    );
    expect(game).toMatchObject({
      key: 'chess-com:123456',
      platformGameId: '123456',
      result: '1-0',
      speed: 'rapid',
      timeControl: '600+5',
      rated: true,
      opening: { eco: 'C20', name: "King's Pawn Game" },
      parseStatus: 'ready',
    });
    expect(game.black.rating).toBeUndefined();
    expect(game.moves).toHaveLength(2);
  });

  it('uses Chess.com UUID fallback and retains unsupported games', () => {
    const game = normalizeChessComGame(
      { uuid: 'fallback', pgn, rules: 'chess960' },
      'chess-com:learner',
      importedAt,
    );
    expect(game.key).toBe('chess-com:fallback');
    expect(game.parseStatus).toBe('unsupported-variant');
    expect(game.moves).toEqual([]);
  });

  it('normalizes Lichess optional players, clocks, opening, and winner', () => {
    const game = normalizeLichessGame(
      {
        id: 'abcd1234',
        pgn,
        speed: 'blitz',
        winner: 'black',
        rated: false,
        lastMoveAt: 1_721_822_400_000,
        clock: { initial: 180, increment: 2 },
        players: { white: { user: { name: 'Learner' }, rating: 1500 }, black: {} },
        opening: { eco: 'C20', name: "King's Pawn Game" },
      },
      'lichess:learner',
      importedAt,
    );
    expect(game).toMatchObject({
      key: 'lichess:abcd1234',
      result: '1-0',
      speed: 'blitz',
      opening: { eco: 'C20', name: "King's Pawn Game" },
    });
    expect(game.black.username).toBe('Opponent');
  });
});

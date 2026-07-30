import { Chess } from 'chess.js';
import { parseImportedPgn } from '../parsing/pgn-parser';
import type {
  EngineEvaluation,
  GameAnalysis,
  ImportedGame,
  MoveAnalysis,
  ReviewMoveClassification,
} from '../domain/coach.types';
import {
  createGameReviewSummary,
  createMoveExplanation,
  evaluationForWhite,
} from './review-insights';

describe('review insights', () => {
  it('counts classifications by side and identifies the learner takeaway', () => {
    const game = importedGame('1. e4 e5 2. Nf3 Nc6 *');
    const analysis = gameAnalysis(game, [
      note(game, 1, 'book'),
      note(game, 2, 'book'),
      note(game, 3, 'mistake', { category: 'opening', centipawnLoss: 120 }),
      note(game, 4, 'best'),
    ]);

    const summary = createGameReviewSummary(game, analysis);

    expect(summary.white.counts.book).toBe(1);
    expect(summary.white.counts.mistake).toBe(1);
    expect(summary.black.counts.book).toBe(1);
    expect(summary.black.counts.best).toBe(1);
    expect(summary.white.concerns).toBe(1);
    expect(summary.black.positive).toBe(2);
    expect(summary.takeaway).toBe('Opening decisions created 1 of 1 key moment.');
  });

  it('normalizes evaluations to White and clamps mate values for the chart', () => {
    expect(evaluationForWhite({ color: 'white' }, evaluation(240))).toBe(2.4);
    expect(evaluationForWhite({ color: 'black' }, evaluation(240))).toBe(-2.4);
    expect(
      evaluationForWhite({ color: 'black' }, { score: { kind: 'mate', moves: -3 }, depth: 14 }),
    ).toBe(10);
  });

  it.each([
    ['1. e4 *', 'e4 follows opening theory', 'book'],
    ['1. Nf3 *', 'Nf3 develops a piece', 'best'],
    ['1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# *', 'Qxf7# ends the game', 'best'],
  ])('explains %s with a local chess motif', (pgn, title, classification) => {
    const game = importedGame(pgn);
    const ply = game.moves.length;
    const analysis = gameAnalysis(game, [
      note(game, ply, classification as ReviewMoveClassification),
    ]);

    expect(createMoveExplanation(game, analysis, ply)).toMatchObject({ title });
  });

  it('describes a book move without preferring an engine continuation', () => {
    const game = importedGame('1. e4 *');
    const analysis = gameAnalysis(game, [
      note(game, 1, 'book', {
        bestMove: 'd2d4',
        bestMoveSan: 'd4',
      }),
    ]);

    const explanation = createMoveExplanation(game, analysis, 1);

    expect(explanation?.body).toBe(
      'It follows established opening theory and leaves white with a roughly balanced position.',
    );
    expect(explanation?.body).not.toContain('stronger continuation');
    expect(explanation?.arrows).toEqual([{ from: 'e2', to: 'e4', kind: 'played' }]);
  });

  it('describes mistakes directly with a readable pawn-unit evaluation drop', () => {
    const game = importedGame('1. e3 *');
    const analysis = gameAnalysis(game, [
      note(game, 1, 'mistake', {
        bestMove: 'e2e4',
        bestMoveSan: 'e4',
        centipawnLoss: 120,
        category: 'opening',
      }),
    ]);

    const explanation = createMoveExplanation(game, analysis, 1);

    expect(explanation?.title).toBe('e3 is a mistake');
    expect(explanation?.body).toContain('e3 is a mistake');
    expect(explanation?.body).toContain('e4 was the stronger continuation');
    expect(explanation?.body).toContain('evaluation drop of about 1.2 pawns');
    expect(explanation?.body).not.toContain('centipawns');
    expect(explanation?.arrows).toEqual([
      { from: 'e2', to: 'e3', kind: 'played' },
      { from: 'e2', to: 'e4', kind: 'best' },
    ]);
  });

  it.each([
    [
      'inaccuracy',
      'e3 is an inaccuracy',
      'e3 is playable but imprecise. e4 was the more accurate continuation.',
    ],
    ['mistake', 'e3 is a mistake', 'e3 is a mistake. e4 was the stronger continuation.'],
    ['miss', 'e3 misses an opportunity', 'e3 misses the opportunity that e4 created.'],
    ['blunder', 'e3 is a blunder', 'e3 is a blunder. e4 was much stronger.'],
  ] as const)(
    'keeps a %s explanation consistent with its classification',
    (classification, title, body) => {
      const game = importedGame('1. e3 *');
      const analysis = gameAnalysis(game, [
        note(game, 1, classification, {
          bestMove: 'e2e4',
          bestMoveSan: 'e4',
        }),
      ]);

      const explanation = createMoveExplanation(game, analysis, 1);

      expect(explanation?.title).toBe(title);
      expect(explanation?.body).toContain(body);
    },
  );

  it('explains the missed pawn-winning sequence from a cached best line', () => {
    const game = importedGame('1. d4 e6 2. Bd2 d5 3. a4 c5 4. e3 Nc6 5. Na3 Nge7 *');
    const analysis = gameAnalysis(game, [
      note(game, 10, 'miss', {
        bestMove: 'c5d4',
        bestMoveSan: 'cxd4',
        principalVariation: ['c5d4', 'e3d4', 'c6d4'],
        bestEvaluation: evaluation(147),
        playedEvaluation: evaluation(-56),
        centipawnLoss: 203,
      }),
    ]);

    expect(createMoveExplanation(game, analysis, 10)?.body).toBe(
      'Nge7 misses an opportunity. After cxd4 exd4 Nxd4, Black wins a pawn. ' +
        'That is an evaluation drop of about 2.03 pawns. ' +
        'The lost opportunity leaves black with a roughly balanced position.',
    );
  });

  it('explains material lost in the played line for another concern classification', () => {
    const game = importedGame('1. a3 *');
    const fen = '3r2k1/8/8/8/8/8/P7/3Q2K1 w - - 0 1';
    const chess = new Chess(fen);
    const played = chess.move({ from: 'a2', to: 'a3' });
    game.moves[0] = {
      ply: 1,
      color: 'white',
      san: played.san,
      from: played.from,
      to: played.to,
      uci: 'a2a3',
      fenBefore: played.before,
      fenAfter: played.after,
    };
    const analysis = gameAnalysis(game, [
      note(game, 1, 'blunder', {
        bestMove: 'd1d8',
        bestMoveSan: 'Qxd8+',
        principalVariation: [],
        playedPrincipalVariation: ['a2a3', 'd8d1'],
      }),
    ]);

    expect(createMoveExplanation(game, analysis, 1)?.body).toBe(
      'a3 is a blunder. After a3 Rxd1+, Black wins a queen. ' +
        'It leaves white with a roughly balanced position.',
    );
  });

  it('does not claim a pawn win when the engine line shows an immediate recovery', () => {
    const game = importedGame(
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 d5 5. exd5 Nxd5 6. Bxd5 Qxd5 7. Nc3 Qc5 *',
    );
    const analysis = gameAnalysis(game, [
      note(game, 14, 'mistake', {
        bestMove: 'd5c6',
        bestMoveSan: 'Qc6',
        principalVariation: [],
        playedPrincipalVariation: ['d5c5', 'c1e3', 'c5e7', 'd3d4', 'c8g4', 'd4e5', 'c6e5'],
        bestEvaluation: evaluation(87),
        playedEvaluation: evaluation(34),
        centipawnLoss: 53,
      }),
    ]);

    expect(createMoveExplanation(game, analysis, 14)?.body).toBe(
      'Qc5 is a mistake. Qc6 was the stronger continuation. ' +
        'That is an evaluation drop of about 0.53 pawns. ' +
        'It leaves black with a roughly balanced position.',
    );
  });

  it('explains the queen lost by Qb6 even when later engine moves change material again', () => {
    const game = importedGame(
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 d5 5. exd5 Nxd5 ' +
        '6. Bxd5 Qxd5 7. Nc3 Qc5 8. Be3 Nd4 9. O-O Nxf3+ 10. Qxf3 Qb6 *',
    );
    const analysis = gameAnalysis(game, [
      note(game, 20, 'blunder', {
        bestMove: 'c5c6',
        bestMoveSan: 'Qc6',
        principalVariation: [],
        playedPrincipalVariation: [
          'c5b6',
          'e3b6',
          'a7b6',
          'c3e4',
          'f7f5',
          'e4g5',
          'h7h6',
          'g5f7',
          'e8f7',
        ],
        bestEvaluation: evaluation(-62),
        playedEvaluation: evaluation(-624),
        centipawnLoss: 562,
      }),
    ]);

    expect(createMoveExplanation(game, analysis, 20)?.body).toBe(
      'Qb6 is a blunder. After Qb6 Bxb6 axb6, White wins a queen for a bishop. ' +
        'That is an evaluation drop of about 5.62 pawns. ' +
        'It leaves black with the more difficult position.',
    );
  });

  it('names a demonstrated tactic in the concrete winning line', () => {
    const game = importedGame('1. Na3 *');
    const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w q - 0 1';
    const chess = new Chess(fen);
    const played = chess.move({ from: 'b5', to: 'a3' });
    game.moves[0] = {
      ply: 1,
      color: 'white',
      san: played.san,
      from: played.from,
      to: played.to,
      uci: 'b5a3',
      fenBefore: played.before,
      fenAfter: played.after,
    };
    const analysis = gameAnalysis(game, [
      note(game, 1, 'miss', {
        bestMove: 'b5c7',
        bestMoveSan: 'Nc7+',
        principalVariation: ['b5c7', 'e8d7', 'c7a8'],
      }),
    ]);

    expect(createMoveExplanation(game, analysis, 1)?.body).toContain(
      'After Nc7+ Kd7 Nxa8, White uses a fork to win a rook.',
    );
  });

  it('describes a lost forced mate separately from centipawn loss', () => {
    const game = importedGame('1. e3 *');
    const analysis = gameAnalysis(game, [
      note(game, 1, 'miss', {
        bestMove: 'e2e4',
        bestMoveSan: 'e4',
        bestEvaluation: { score: { kind: 'mate', moves: 3 }, depth: 14 },
        playedEvaluation: evaluation(80),
      }),
    ]);

    const explanation = createMoveExplanation(game, analysis, 1);

    expect(explanation?.body).toContain('It gives up a forced checkmate.');
    expect(explanation?.body).not.toContain('evaluation drop');
  });

  it('explains a newly allowed mate once, with the correct side and distance', () => {
    const game = importedGame('1. e3 *');
    game.moves[0] = {
      ...game.moves[0]!,
      san: 'Qxe7',
    };
    const analysis = gameAnalysis(game, [
      note(game, 1, 'blunder', {
        bestMove: 'f1f2',
        bestMoveSan: 'Rf2',
        bestEvaluation: evaluation(-537),
        playedEvaluation: { score: { kind: 'mate', moves: -1 }, depth: 16 },
      }),
    ]);

    const explanation = createMoveExplanation(game, analysis, 1);

    expect(explanation?.body).toBe(
      'Qxe7 is a blunder. Rf2 was much stronger. It allows Black to force checkmate in 1.',
    );
    expect(explanation?.body.match(/force checkmate/g)).toHaveLength(1);
    expect(explanation?.body).not.toContain('against it');
  });

  it('names White as the mating side after a Black blunder', () => {
    const game = importedGame('1. e4 e5 *');
    const analysis = gameAnalysis(game, [
      note(game, 2, 'blunder', {
        bestMove: 'c7c5',
        bestMoveSan: 'c5',
        bestEvaluation: evaluation(-200),
        playedEvaluation: { score: { kind: 'mate', moves: -2 }, depth: 16 },
      }),
    ]);

    expect(createMoveExplanation(game, analysis, 2)?.body).toContain(
      'It allows White to force checkmate in 2.',
    );
  });

  it('describes shortened unavoidable mate without contradictory advice', () => {
    const game = importedGame('1. e3 *');
    const analysis = gameAnalysis(game, [
      note(game, 1, 'mistake', {
        bestMove: 'e2e4',
        bestMoveSan: 'e4',
        bestEvaluation: { score: { kind: 'mate', moves: -6 }, depth: 16 },
        playedEvaluation: { score: { kind: 'mate', moves: -2 }, depth: 16 },
      }),
    ]);

    expect(createMoveExplanation(game, analysis, 1)?.body).toBe(
      'e3 is a mistake. e4 was stronger. It lets Black force checkmate in 2 instead of 6.',
    );
  });

  it('does not recommend an alternative for equally long unavoidable mate', () => {
    const game = importedGame('1. e3 *');
    const analysis = gameAnalysis(game, [
      note(game, 1, 'best', {
        bestMove: 'e2e4',
        bestMoveSan: 'e4',
        bestEvaluation: { score: { kind: 'mate', moves: -4 }, depth: 16 },
        playedEvaluation: { score: { kind: 'mate', moves: -4 }, depth: 16 },
      }),
    ]);

    const explanation = createMoveExplanation(game, analysis, 1);
    expect(explanation?.body).toBe(
      'It preserves the longest defense against Black’s forced checkmate.',
    );
    expect(explanation?.body).not.toContain('stronger continuation');
  });

  it('does not recommend an alternative when a non-top move preserves a faster mate', () => {
    const game = importedGame('1. e3 *');
    const analysis = gameAnalysis(game, [
      note(game, 1, 'best', {
        bestMove: 'e2e4',
        bestMoveSan: 'e4',
        bestEvaluation: { score: { kind: 'mate', moves: 3 }, depth: 16 },
        playedEvaluation: { score: { kind: 'mate', moves: 2 }, depth: 16 },
      }),
    ]);

    const explanation = createMoveExplanation(game, analysis, 1);

    expect(explanation?.body).toBe(
      'It preserves the best winning outcome and leaves white with a forced mate in 2.',
    );
    expect(explanation?.body).not.toContain('stronger continuation');
    expect(explanation?.arrows).toEqual([{ from: 'e2', to: 'e3', kind: 'played' }]);
  });

  it('ends an immediate checkmate explanation without continuation advice', () => {
    const game = importedGame('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# *');
    const ply = game.moves.length;
    const analysis = gameAnalysis(game, [
      note(game, ply, 'best', {
        bestMove: 'h5h7',
        bestMoveSan: 'Qh7#',
        bestEvaluation: { score: { kind: 'mate', moves: 1 }, depth: 16 },
        playedEvaluation: { score: { kind: 'mate', moves: 1 }, depth: 16 },
      }),
    ]);

    const explanation = createMoveExplanation(game, analysis, ply);

    expect(explanation?.body).toBe('It delivers checkmate and ends the game immediately.');
    expect(explanation?.arrows).toEqual([{ from: 'h5', to: 'f7', kind: 'played' }]);
  });
});

function importedGame(moves: string): ImportedGame {
  const parsed = parseImportedPgn(`[White "Learner"]
[Black "Opponent"]
[Result "*"]

${moves}`);
  return {
    key: 'local:review-insights',
    platform: 'local',
    platformGameId: 'review-insights',
    platformUrl: '',
    pgn: '',
    variant: 'standard',
    white: { username: 'Learner', rating: 1400 },
    black: { username: 'Opponent', rating: 1450 },
    result: '*',
    speed: 'rapid',
    timeControl: '600',
    rated: false,
    endTime: '2026-07-28T12:00:00.000Z',
    moves: parsed.moves,
    parseStatus: parsed.status,
    profileKeys: [],
    firstImportedAt: '2026-07-28T12:00:00.000Z',
    lastImportedAt: '2026-07-28T12:00:00.000Z',
    learnerColor: 'white',
  };
}

function gameAnalysis(game: ImportedGame, reviewMoves: MoveAnalysis[]): GameAnalysis {
  return {
    importedGameKey: game.key,
    schemaVersion: 1,
    sourceFingerprint: 'review-insights',
    engineVersion: 'test',
    depth: 14,
    learnerColor: 'white',
    status: 'complete',
    totalUserMoves: game.moves.filter((move) => move.color === 'white').length,
    moves: reviewMoves.filter((move) => game.moves[move.ply - 1]?.color === 'white'),
    reviewMoves,
    updatedAt: '2026-07-28T12:00:00.000Z',
  };
}

function note(
  game: ImportedGame,
  ply: number,
  classification: ReviewMoveClassification,
  overrides: Partial<MoveAnalysis> = {},
): MoveAnalysis {
  const move = game.moves[ply - 1]!;
  return {
    importedGameKey: game.key,
    ply,
    playedMove: move.uci,
    bestMove: move.uci,
    bestMoveSan: move.san,
    principalVariation: [],
    bestEvaluation: evaluation(30),
    playedEvaluation: evaluation(20),
    classification: classification === 'mistake' ? 'mistake' : 'good',
    reviewClassification: classification,
    ...overrides,
  };
}

function evaluation(value: number): EngineEvaluation {
  return { score: { kind: 'centipawn', value }, depth: 14 };
}

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

    expect(explanation?.body).toContain('It gives up a forced mate.');
    expect(explanation?.body).not.toContain('evaluation drop');
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

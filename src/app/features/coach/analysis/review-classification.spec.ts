import { Chess, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { PositionAnalysisResult } from '../../../core/engine/analysis-engine.types';
import { STARTING_FEN } from '../../../core/game/game.types';
import type { ImportedMove, ReviewMoveClassification } from '../domain/coach.types';
import { assessMove, classifyReviewMove, legacyClassification } from './review-classification';

describe('review move classification', () => {
  it('recognizes opening-book and sound-sacrifice moves', () => {
    const opening = moveFrom(STARTING_FEN, 'e4');
    expect(classifyReviewMove(opening, result('e2e4', 0.62, 0.6), result('e2e4', 0.62), true)).toBe(
      'book',
    );

    const sacrifice: ImportedMove = {
      ...baseMove(),
      from: 'd1',
      to: 'h5',
      uci: 'd1h5',
      san: 'Qh5',
      fenBefore: '7k/8/6p1/8/8/8/8/3QK3 w - - 0 1',
      fenAfter: '7k/8/6p1/7Q/8/8/8/4K3 b - - 1 1',
    };
    expect(classifyReviewMove(sacrifice, result('d1h5', 0.65, 0.64), result('d1h5', 0.64))).toBe(
      'brilliant',
    );
  });

  it.each([
    ['great', result('e2e4', 0.65, 0.54), result('e2e4', 0.65)],
    ['best', result('e2e4', 0.65, 0.64), result('e2e4', 0.65)],
    ['excellent', result('d2d4', 0.65, 0.64), result('e2e4', 0.63)],
    ['good', result('d2d4', 0.65, 0.64), result('e2e4', 0.62)],
    ['inaccuracy', result('d2d4', 0.65, 0.64), result('e2e4', 0.57)],
    ['mistake', result('d2d4', 0.65, 0.64), result('e2e4', 0.5)],
    ['miss', result('d2d4', 0.8, 0.7), result('e2e4', 0.55)],
    ['blunder', result('d2d4', 0.65, 0.64), result('e2e4', 0.39)],
  ] satisfies Array<[ReviewMoveClassification, PositionAnalysisResult, PositionAnalysisResult]>)(
    'classifies a move as %s',
    (classification, best, played) => {
      expect(classifyReviewMove(baseMove(), best, played)).toBe(classification);
    },
  );

  it.each([
    ['best', mateResult('d2d4', 3), mateResult('e2e4', 2)],
    ['best', result('d2d4', 0.99, 0.98), mateResult('e2e4', 4)],
    ['excellent', mateResult('d2d4', 3), mateResult('e2e4', 4)],
    ['miss', mateResult('d2d4', 5), centipawnResult('e2e4', 1279, 0.99)],
    ['blunder', mateResult('d2d4', 5), mateResult('e2e4', -5)],
  ] satisfies Array<[ReviewMoveClassification, PositionAnalysisResult, PositionAnalysisResult]>)(
    'classifies mate transitions as %s',
    (classification, best, played) => {
      expect(classifyReviewMove(baseMove(), best, played)).toBe(classification);
    },
  );

  it('treats an immediate checkmate as best even when Stockfish ranks another move first', () => {
    const move = moveFrom('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'Qh4#');

    expect(
      classifyReviewMove(move, mateResult('d8h4', 1), centipawnResult('d8h4', 900, 0.98)),
    ).toBe('best');
  });

  it.each([
    [-700, -2, 'blunder'],
    [-701, -2, 'mistake'],
    [-1000, -2, 'mistake'],
    [-1001, -2, 'inaccuracy'],
    [-1200, -1, 'blunder'],
  ] as const)(
    'classifies a newly allowed mate from %i to M%i as %s',
    (bestValue, mateMoves, classification) => {
      expect(
        classifyReviewMove(
          baseMove(),
          centipawnResult('d2d4', bestValue, 0),
          mateResult('e2e4', mateMoves),
          true,
        ),
      ).toBe(classification);
    },
  );

  it('regresses a saturated −5.37 to −M1 evaluation as a blunder', () => {
    expect(
      assessMove(baseMove(), centipawnResult('d2d4', -537, 0), mateResult('e2e4', -1)),
    ).toEqual({ classification: 'blunder', concern: true });
  });

  it.each([
    [-5, -5, 'best'],
    [-5, -8, 'best'],
    [-5, -4, 'inaccuracy'],
    [-5, -2, 'mistake'],
    [-5, -1, 'blunder'],
  ] as const)(
    'compares unavoidable mate transitions %i to %i as %s',
    (bestMoves, playedMoves, classification) => {
      expect(
        classifyReviewMove(
          baseMove(),
          mateResult('d2d4', bestMoves),
          mateResult('e2e4', playedMoves),
        ),
      ).toBe(classification);
    },
  );

  it('applies root-side mate signs identically for Black', () => {
    expect(
      classifyReviewMove(
        { ...baseMove(), color: 'black' },
        centipawnResult('d2d4', -537, 0),
        mateResult('e2e4', -1),
      ),
    ).toBe('blunder');
  });

  it('falls back to evaluation-derived expected points when WDL is absent', () => {
    expect(
      classifyReviewMove(
        baseMove(),
        centipawnResultWithoutWdl('d2d4', 100),
        centipawnResultWithoutWdl('e2e4', 80),
      ),
    ).toBe('good');
  });

  it('retains expected-points behavior in a decisive non-mate position', () => {
    expect(
      classifyReviewMove(
        baseMove(),
        centipawnResult('d2d4', -1200, 0),
        centipawnResult('e2e4', -2000, 0),
      ),
    ).toBe('excellent');
  });

  it.each([
    ['miss', 'mistake'],
    ['blunder', 'blunder'],
    ['inaccuracy', 'inaccuracy'],
    ['best', 'good'],
    ['book', 'good'],
  ] as const)('maps %s to the persisted %s label', (review, legacy) => {
    expect(legacyClassification(review)).toBe(legacy);
  });
});

function result(
  bestMove: string,
  expectedPoints: number,
  secondBestExpectedPoints?: number,
): PositionAnalysisResult {
  return {
    bestMove: {
      from: bestMove.slice(0, 2) as Square,
      to: bestMove.slice(2, 4) as Square,
    },
    evaluation: { score: { kind: 'centipawn', value: 0 }, depth: 14 },
    expectedPoints,
    principalVariation: [bestMove],
    ...(secondBestExpectedPoints === undefined
      ? {}
      : {
          variations: [
            {
              rank: 1,
              evaluation: { score: { kind: 'centipawn', value: 0 }, depth: 14 },
              expectedPoints,
              principalVariation: [bestMove],
            },
            {
              rank: 2,
              evaluation: { score: { kind: 'centipawn', value: 0 }, depth: 14 },
              expectedPoints: secondBestExpectedPoints,
              principalVariation: ['g1f3'],
            },
          ],
        }),
  };
}

function mateResult(bestMove: string, moves: number): PositionAnalysisResult {
  const resultValue = result(bestMove, moves > 0 ? 1 : 0);
  return {
    ...resultValue,
    evaluation: { score: { kind: 'mate', moves }, depth: 14 },
  };
}

function centipawnResult(
  bestMove: string,
  value: number,
  expectedPoints: number,
): PositionAnalysisResult {
  const resultValue = result(bestMove, expectedPoints);
  return {
    ...resultValue,
    evaluation: { score: { kind: 'centipawn', value }, depth: 14 },
  };
}

function centipawnResultWithoutWdl(bestMove: string, value: number): PositionAnalysisResult {
  const resultValue = result(bestMove, 0);
  return {
    bestMove: resultValue.bestMove,
    evaluation: { score: { kind: 'centipawn', value }, depth: 14 },
    principalVariation: resultValue.principalVariation,
  };
}

function baseMove(): ImportedMove {
  return {
    ply: 1,
    color: 'white',
    san: 'e4',
    from: 'e2',
    to: 'e4',
    uci: 'e2e4',
    fenBefore: STARTING_FEN,
    fenAfter: STARTING_FEN,
  };
}

function moveFrom(fen: string, san: string): ImportedMove {
  const chess = new Chess(fen);
  const played = chess.move(san);
  return {
    ...baseMove(),
    san: played.san,
    from: played.from,
    to: played.to,
    uci: `${played.from}${played.to}${played.promotion ?? ''}`,
    fenBefore: fen,
    fenAfter: chess.fen(),
  };
}

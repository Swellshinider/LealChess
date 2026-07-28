import { Chess, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { PositionAnalysisResult } from '../../../core/engine/analysis-engine.types';
import { STARTING_FEN } from '../../../core/game/game.types';
import type { ImportedMove, ReviewMoveClassification } from '../domain/coach.types';
import { classifyReviewMove } from './review-classification';

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

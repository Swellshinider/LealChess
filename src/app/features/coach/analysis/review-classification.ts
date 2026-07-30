import { Chess, type Color, type PieceSymbol } from 'chess.js';
import type { PositionAnalysisResult } from '../../../core/engine/analysis-engine.types';
import type { ImportedMove, ReviewMoveClassification } from '../domain/coach.types';
import { moveToUci } from './analysis-rules';
import { classifyReviewMoveQuality } from './review-classification-rules';

export function classifyReviewMove(
  move: ImportedMove,
  best: PositionAnalysisResult,
  played: PositionAnalysisResult,
  book = false,
): ReviewMoveClassification {
  const bestExpectedPoints = expectedPoints(best);
  const playedExpectedPoints = expectedPoints(played);
  const secondBest = best.variations?.find((variation) => variation.rank === 2);
  const bestWinningMate = winningMateDistance(best);
  const playedWinningMate = winningMateDistance(played);
  const outcomeEquivalentMate =
    new Chess(move.fenAfter).isCheckmate() ||
    (playedWinningMate !== undefined &&
      (bestWinningMate === undefined || playedWinningMate <= bestWinningMate));

  return classifyReviewMoveQuality({
    book,
    playedBestMove: best.bestMove ? moveToUci(best.bestMove) === move.uci : false,
    bestExpectedPoints,
    playedExpectedPoints,
    ...(secondBest
      ? {
          secondBestExpectedPoints:
            secondBest.expectedPoints ?? evaluationExpected(secondBest.evaluation),
        }
      : {}),
    soundSacrifice: isSoundSacrifice(move) && bestExpectedPoints - playedExpectedPoints <= 0.02,
    outcomeEquivalentMate,
    lostForcedMate: bestWinningMate !== undefined && playedWinningMate === undefined,
  });
}

function expectedPoints(result: PositionAnalysisResult): number {
  return result.expectedPoints ?? evaluationExpected(result.evaluation);
}

function evaluationExpected(evaluation: PositionAnalysisResult['evaluation']): number {
  if (evaluation.score.kind === 'mate') return evaluation.score.moves > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-evaluation.score.value / 240));
}

function winningMateDistance(result: PositionAnalysisResult): number | undefined {
  return result.evaluation.score.kind === 'mate' && result.evaluation.score.moves > 0
    ? result.evaluation.score.moves
    : undefined;
}

function isSoundSacrifice(move: ImportedMove): boolean {
  const before = new Chess(move.fenBefore);
  const piece = before.get(move.from)?.type;
  if (!piece || piece === 'p' || piece === 'k') return false;

  const after = new Chess(move.fenAfter);
  const opponent = (move.color === 'white' ? 'b' : 'w') as Color;
  const values: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  return after
    .attackers(move.to, opponent)
    .some((square) => values[after.get(square)?.type ?? 'k'] < values[piece]);
}

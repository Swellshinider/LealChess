import { Chess, type Color, type PieceSymbol } from 'chess.js';
import type { PositionAnalysisResult } from '../engine/analysis-engine.types';
import { moveToUci } from '../game/chess-move';
import {
  FORCED_MATE_THRESHOLDS,
  type ClassifiedMove,
  type ConcernMoveClassification,
  type MoveClassification,
  type ReviewMoveClassification,
} from './move-classification.types';
import { classifyReviewMoveQuality } from './move-classification-rules';

export interface MoveAssessment {
  classification: ReviewMoveClassification;
  centipawnLoss?: number;
  concern: boolean;
}

export type MateComparison =
  | 'none'
  | 'delivered'
  | 'winning-equivalent'
  | 'winning-mate-lost'
  | 'winning-mate-reversed'
  | 'losing-mate-new'
  | 'losing-mate-equivalent'
  | 'losing-mate-shortened';

export function classifyReviewMove(
  move: ClassifiedMove,
  best: PositionAnalysisResult,
  played: PositionAnalysisResult,
  book = false,
): ReviewMoveClassification {
  return assessMove(move, best, played, book).classification;
}

export function assessMove(
  move: ClassifiedMove,
  best: PositionAnalysisResult,
  played: PositionAnalysisResult,
  book = false,
): MoveAssessment {
  const mateComparison = compareMateOutcomes(move, best.evaluation, played.evaluation);
  const forcedClassification = classifyForcedOutcome(mateComparison, best, played);
  const centipawnLoss =
    best.evaluation.score.kind === 'centipawn' && played.evaluation.score.kind === 'centipawn'
      ? Math.max(0, best.evaluation.score.value - played.evaluation.score.value)
      : undefined;
  if (forcedClassification) {
    return assessment(forcedClassification, centipawnLoss);
  }

  const bestExpectedPoints = expectedPoints(best);
  const playedExpectedPoints = expectedPoints(played);
  const secondBest = best.variations?.find((variation) => variation.rank === 2);
  const classification = classifyReviewMoveQuality({
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
  });
  return assessment(classification, centipawnLoss);
}

export function compareMateOutcomes(
  move: Pick<ClassifiedMove, 'fenAfter'>,
  best: PositionAnalysisResult['evaluation'],
  played: PositionAnalysisResult['evaluation'],
): MateComparison {
  if (new Chess(move.fenAfter).isCheckmate()) return 'delivered';

  const bestMate = best.score.kind === 'mate' ? best.score.moves : undefined;
  const playedMate = played.score.kind === 'mate' ? played.score.moves : undefined;
  if (playedMate !== undefined && playedMate > 0) {
    return bestMate === undefined || bestMate <= 0 || playedMate <= bestMate
      ? 'winning-equivalent'
      : 'none';
  }
  if (bestMate !== undefined && bestMate > 0) {
    return playedMate !== undefined && playedMate < 0
      ? 'winning-mate-reversed'
      : 'winning-mate-lost';
  }
  if (playedMate !== undefined && playedMate < 0) {
    if (bestMate === undefined || bestMate >= 0) return 'losing-mate-new';
    return Math.abs(playedMate) >= Math.abs(bestMate)
      ? 'losing-mate-equivalent'
      : 'losing-mate-shortened';
  }
  return 'none';
}

export function legacyClassification(classification: ReviewMoveClassification): MoveClassification {
  if (classification === 'miss') return 'mistake';
  return isConcernClassification(classification) ? classification : 'good';
}

export function isConcernClassification(
  classification: ReviewMoveClassification,
): classification is ConcernMoveClassification {
  return ['inaccuracy', 'mistake', 'miss', 'blunder'].includes(classification);
}

function classifyForcedOutcome(
  comparison: MateComparison,
  best: PositionAnalysisResult,
  played: PositionAnalysisResult,
): ReviewMoveClassification | undefined {
  switch (comparison) {
    case 'delivered':
    case 'winning-equivalent':
    case 'losing-mate-equivalent':
      return 'best';
    case 'winning-mate-reversed':
      return 'blunder';
    case 'winning-mate-lost':
      return 'miss';
    case 'losing-mate-shortened': {
      const bestMoves = Math.abs(mateMoves(best)!);
      const playedMoves = Math.abs(mateMoves(played)!);
      if (playedMoves === 1) return 'blunder';
      return bestMoves - playedMoves >= 3 ? 'mistake' : 'inaccuracy';
    }
    case 'losing-mate-new': {
      const playedMoves = Math.abs(mateMoves(played)!);
      if (playedMoves === 1) return 'blunder';
      const bestScore =
        best.evaluation.score.kind === 'centipawn'
          ? best.evaluation.score.value
          : Number.POSITIVE_INFINITY;
      if (bestScore >= FORCED_MATE_THRESHOLDS.seriousError) return 'blunder';
      if (bestScore >= FORCED_MATE_THRESHOLDS.inaccuracy) return 'mistake';
      return 'inaccuracy';
    }
    case 'none':
      return undefined;
  }
}

function assessment(
  classification: ReviewMoveClassification,
  centipawnLoss: number | undefined,
): MoveAssessment {
  return {
    classification,
    ...(centipawnLoss === undefined ? {} : { centipawnLoss }),
    concern: isConcernClassification(classification),
  };
}

function mateMoves(result: PositionAnalysisResult): number | undefined {
  return result.evaluation.score.kind === 'mate' ? result.evaluation.score.moves : undefined;
}

function expectedPoints(result: PositionAnalysisResult): number {
  return result.expectedPoints ?? evaluationExpected(result.evaluation);
}

function evaluationExpected(evaluation: PositionAnalysisResult['evaluation']): number {
  if (evaluation.score.kind === 'mate') return evaluation.score.moves > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-evaluation.score.value / 240));
}

function isSoundSacrifice(move: ClassifiedMove): boolean {
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

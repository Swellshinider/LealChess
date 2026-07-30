import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type {
  EngineEvaluation,
  GameAnalysis,
  ImportedGame,
  ImportedMove,
  MistakeCategory,
  MoveAnalysis,
  ReviewMoveClassification,
} from '../domain/coach.types';
import { compareMateOutcomes, isConcernClassification } from '../analysis/review-classification';

export const REVIEW_CLASSIFICATIONS: readonly ReviewMoveClassification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

export interface ReviewEvaluationPoint {
  ply: number;
  value: number;
  mate: boolean;
  classification: ReviewMoveClassification;
}

export interface PlayerReviewSummary {
  counts: Record<ReviewMoveClassification, number>;
  positive: number;
  concerns: number;
}

export interface GameReviewSummary {
  evaluations: ReviewEvaluationPoint[];
  white: PlayerReviewSummary;
  black: PlayerReviewSummary;
  takeaway: string;
}

export interface MoveIdeaArrow {
  from: Square;
  to: Square;
  kind: 'played' | 'best';
}

export interface MoveExplanation {
  classification: ReviewMoveClassification;
  title: string;
  body: string;
  arrows: MoveIdeaArrow[];
}

const MATE_CHART_VALUE = 10;
const CHART_LIMIT = 10;

export function createGameReviewSummary(
  game: ImportedGame,
  analysis: GameAnalysis | null,
): GameReviewSummary {
  const reviewMoves = analysis?.reviewMoves ?? analysis?.moves ?? [];
  const white = createPlayerSummary();
  const black = createPlayerSummary();
  const evaluations: ReviewEvaluationPoint[] = [];

  for (const note of reviewMoves) {
    const move = game.moves[note.ply - 1];
    if (!move) continue;
    const player = move.color === 'white' ? white : black;
    player.counts[note.reviewClassification] += 1;
    if (isPositive(note.reviewClassification)) player.positive += 1;
    if (isConcern(note.reviewClassification)) player.concerns += 1;
    evaluations.push({
      ply: note.ply,
      value: evaluationForWhite(move, note.playedEvaluation),
      mate: note.playedEvaluation.score.kind === 'mate',
      classification: note.reviewClassification,
    });
  }

  return {
    evaluations,
    white,
    black,
    takeaway: learningTakeaway(analysis),
  };
}

export function createMoveExplanation(
  game: ImportedGame,
  analysis: GameAnalysis | null,
  ply: number,
): MoveExplanation | null {
  const move = game.moves[ply - 1];
  const note = (analysis?.reviewMoves ?? analysis?.moves)?.find((item) => item.ply === ply);
  if (!move || !note) return null;

  const chess = new Chess(move.fenBefore);
  const piece = chess.get(move.from);
  const title = moveIdeaTitle(move, note, piece?.type);
  const arrows: MoveIdeaArrow[] = [{ from: move.from, to: move.to, kind: 'played' }];
  if (note.bestMove !== note.playedMove && note.reviewClassification !== 'best') {
    const best = parseUci(note.bestMove);
    if (best) arrows.push({ ...best, kind: 'best' });
  }

  return {
    classification: note.reviewClassification,
    title,
    body: moveIdeaBody(move, note),
    arrows,
  };
}

export function evaluationForWhite(
  move: Pick<ImportedMove, 'color'>,
  evaluation: EngineEvaluation,
): number {
  const moverSign = move.color === 'white' ? 1 : -1;
  if (evaluation.score.kind === 'mate') {
    return Math.sign(evaluation.score.moves || 1) * moverSign * MATE_CHART_VALUE;
  }
  return clamp((evaluation.score.value / 100) * moverSign, -CHART_LIMIT, CHART_LIMIT);
}

function createPlayerSummary(): PlayerReviewSummary {
  return {
    counts: Object.fromEntries(REVIEW_CLASSIFICATIONS.map((item) => [item, 0])) as Record<
      ReviewMoveClassification,
      number
    >,
    positive: 0,
    concerns: 0,
  };
}

function learningTakeaway(analysis: GameAnalysis | null): string {
  const learnerMoves = analysis?.moves ?? [];
  const concernMoves = learnerMoves.filter((move) => move.category);
  if (!concernMoves.length) {
    return learnerMoves.length
      ? 'No major learning moments crossed the review thresholds.'
      : 'The review will identify the moments that most changed the game.';
  }

  const counts = new Map<MistakeCategory, number>();
  for (const move of concernMoves) {
    if (move.category) counts.set(move.category, (counts.get(move.category) ?? 0) + 1);
  }
  const [category, count] = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0]!;
  const label: Record<MistakeCategory, string> = {
    opening: 'opening decisions',
    tactical: 'tactical awareness',
    positional: 'positional choices',
    endgame: 'endgame technique',
  };
  return `${capitalize(label[category])} created ${count} of ${concernMoves.length} key ${
    concernMoves.length === 1 ? 'moment' : 'moments'
  }.`;
}

function moveIdeaTitle(
  move: ImportedMove,
  note: MoveAnalysis,
  piece: PieceSymbol | undefined,
): string {
  switch (note.reviewClassification) {
    case 'inaccuracy':
      return `${move.san} is an inaccuracy`;
    case 'mistake':
      return `${move.san} is a mistake`;
    case 'miss':
      return `${move.san} misses an opportunity`;
    case 'blunder':
      return `${move.san} is a blunder`;
  }
  if (move.san.includes('#')) return `${move.san} ends the game`;
  if (/^O-O(?:-O)?/.test(move.san)) return `${move.san} brings the king to safety`;
  if (move.san.includes('=')) return `${move.san} promotes the pawn`;
  if (move.san.includes('+')) return `${move.san} forces a reply`;
  if (move.san.includes('x')) return `${move.san} changes the material balance`;
  if (note.reviewClassification === 'book') return `${move.san} follows opening theory`;
  if (piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(move.to)) {
    return `${move.san} claims central space`;
  }
  if (isDevelopment(move, piece)) return `${move.san} develops a piece`;
  if (piece === 'n' && ['c3', 'd4', 'e4', 'f3', 'c6', 'd5', 'e5', 'f6'].includes(move.to)) {
    return `${move.san} improves the knight`;
  }
  if (note.bestMove === note.playedMove) return `${move.san} is Stockfish’s first choice`;
  return `${move.san} continues the position`;
}

function moveIdeaBody(move: ImportedMove, note: MoveAnalysis): string {
  const position = moverPositionLabel(note.playedEvaluation);
  const evaluationDrop = evaluationDropText(note);
  const mateComparison = compareMateOutcomes(move, note.bestEvaluation, note.playedEvaluation);
  const mateTransition = forcedMateTransition(move, note, mateComparison);

  if (move.san.includes('#')) {
    return 'It delivers checkmate and ends the game immediately.';
  }

  if (isConcernClassification(note.reviewClassification) && mateTransition) {
    return `${concernExplanationLead(move, note)} ${mateTransition}`;
  }

  switch (note.reviewClassification) {
    case 'inaccuracy':
      return `${move.san} is playable but imprecise. ${note.bestMoveSan} was the more accurate continuation.${evaluationDrop} It leaves ${move.color} with ${position}.`;
    case 'mistake':
      return `${move.san} is a mistake. ${note.bestMoveSan} was the stronger continuation.${evaluationDrop} It leaves ${move.color} with ${position}.`;
    case 'miss':
      return `${move.san} misses the opportunity that ${note.bestMoveSan} created.${evaluationDrop} The lost opportunity leaves ${move.color} with ${position}.`;
    case 'blunder':
      return `${move.san} is a blunder. ${note.bestMoveSan} was much stronger.${evaluationDrop} It leaves ${move.color} with ${position}.`;
  }

  if (note.bestMove === note.playedMove) {
    return `It matches the engine’s top move and leaves ${move.color} with ${position}.`;
  }

  if (note.reviewClassification === 'best' && mateComparison === 'winning-equivalent') {
    return `It preserves the best winning outcome and leaves ${move.color} with ${position}.`;
  }
  if (note.reviewClassification === 'best' && mateComparison === 'losing-mate-equivalent') {
    return `It preserves the longest defense against ${opponentName(move)}’s forced checkmate.`;
  }

  return `The idea is playable, but ${note.bestMoveSan} was the stronger continuation.${evaluationDrop} It leaves ${move.color} with ${position}.`;
}

function concernExplanationLead(move: ImportedMove, note: MoveAnalysis): string {
  switch (note.reviewClassification) {
    case 'inaccuracy':
      return `${move.san} is an inaccuracy. ${note.bestMoveSan} was more accurate.`;
    case 'mistake':
      return `${move.san} is a mistake. ${note.bestMoveSan} was stronger.`;
    case 'miss':
      return `${move.san} misses an opportunity. ${note.bestMoveSan} created a forced win.`;
    case 'blunder':
      return `${move.san} is a blunder. ${note.bestMoveSan} was much stronger.`;
    default:
      return '';
  }
}

function evaluationDropText(note: MoveAnalysis): string {
  if (
    note.bestEvaluation.score.kind === 'mate' ||
    note.playedEvaluation.score.kind === 'mate' ||
    note.centipawnLoss === undefined ||
    note.centipawnLoss <= 0
  ) {
    return '';
  }
  const pawns = Number((note.centipawnLoss / 100).toFixed(2));
  return ` That is an evaluation drop of about ${pawns} ${pawns === 1 ? 'pawn' : 'pawns'}.`;
}

function forcedMateTransition(
  move: ImportedMove,
  note: MoveAnalysis,
  comparison: ReturnType<typeof compareMateOutcomes>,
): string {
  const playedMoves =
    note.playedEvaluation.score.kind === 'mate'
      ? Math.abs(note.playedEvaluation.score.moves)
      : undefined;
  switch (comparison) {
    case 'winning-mate-lost':
      return 'It gives up a forced checkmate.';
    case 'winning-mate-reversed':
      return `It gives up a forced checkmate and allows ${opponentName(move)} to force checkmate in ${playedMoves}.`;
    case 'losing-mate-new':
      return `It allows ${opponentName(move)} to force checkmate in ${playedMoves}.`;
    case 'losing-mate-shortened': {
      const bestMoves =
        note.bestEvaluation.score.kind === 'mate'
          ? Math.abs(note.bestEvaluation.score.moves)
          : undefined;
      return `It lets ${opponentName(move)} force checkmate in ${playedMoves} instead of ${bestMoves}.`;
    }
    default:
      return '';
  }
}

function opponentName(move: ImportedMove): string {
  return move.color === 'white' ? 'Black' : 'White';
}

function moverPositionLabel(evaluation: EngineEvaluation): string {
  if (evaluation.score.kind === 'mate') {
    return evaluation.score.moves > 0
      ? `a forced mate in ${Math.abs(evaluation.score.moves)}`
      : `a forced mate against it in ${Math.abs(evaluation.score.moves)}`;
  }
  if (evaluation.score.value >= 80) return 'the more favorable position';
  if (evaluation.score.value <= -80) return 'the more difficult position';
  return 'a roughly balanced position';
}

function isDevelopment(move: ImportedMove, piece: PieceSymbol | undefined): boolean {
  if (piece !== 'n' && piece !== 'b') return false;
  const homeRank = move.color === 'white' ? '1' : '8';
  return move.from.endsWith(homeRank) && !move.to.endsWith(homeRank);
}

function isPositive(classification: ReviewMoveClassification): boolean {
  return ['brilliant', 'great', 'best', 'excellent', 'book'].includes(classification);
}

function isConcern(classification: ReviewMoveClassification): boolean {
  return isConcernClassification(classification);
}

function parseUci(uci: string): { from: Square; to: Square } | null {
  if (!/^[a-h][1-8][a-h][1-8]/.test(uci)) return null;
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

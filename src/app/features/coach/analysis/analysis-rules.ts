import { Chess } from 'chess.js';
import type { MoveInput } from '../../../core/game/game.types';
import {
  ANALYSIS_DEPTH,
  ANALYSIS_ENGINE_VERSION,
  ANALYSIS_SCHEMA_VERSION,
  CLASSIFICATION_THRESHOLDS,
} from './analysis.constants';
import type {
  EngineEvaluation,
  GameAnalysis,
  ImportedGame,
  ImportedProfile,
  LearningPriority,
  MistakeCategory,
  MoveAnalysis,
  MoveClassification,
  TrainingPosition,
} from '../domain/coach.types';
import type { ChessColor } from '../../../shared/chess/chess.types';

const ADVICE: Record<MistakeCategory, string> = {
  opening: 'Revisit opening principles and compare plans before committing to early moves.',
  tactical: 'Pause for checks, captures, and threats before choosing a candidate move.',
  positional: 'Compare piece activity, weak squares, and pawn structure before deciding.',
  endgame: 'Practice simplified positions and calculate forcing king-and-pawn sequences.',
};

export function classifyMove(
  best: EngineEvaluation,
  played: EngineEvaluation,
): { classification: MoveClassification; centipawnLoss?: number } {
  if (best.score.kind === 'mate') {
    const preservesMate =
      played.score.kind === 'mate' && Math.sign(best.score.moves) === Math.sign(played.score.moves);
    return { classification: preservesMate ? 'good' : 'blunder' };
  }
  if (played.score.kind === 'mate') {
    return { classification: played.score.moves > 0 ? 'good' : 'blunder' };
  }

  const centipawnLoss = Math.max(0, best.score.value - played.score.value);
  if (centipawnLoss >= CLASSIFICATION_THRESHOLDS.blunder) {
    return { classification: 'blunder', centipawnLoss };
  }
  if (centipawnLoss >= CLASSIFICATION_THRESHOLDS.mistake) {
    return { classification: 'mistake', centipawnLoss };
  }
  if (centipawnLoss >= CLASSIFICATION_THRESHOLDS.inaccuracy) {
    return { classification: 'inaccuracy', centipawnLoss };
  }
  return { classification: 'good', centipawnLoss };
}

export function categorizeMistake(fen: string, ply: number, bestMoveSan: string): MistakeCategory {
  if (ply <= 20) return 'opening';
  const chess = new Chess(fen);
  const phase = chess
    .board()
    .flat()
    .reduce(
      (total, piece) =>
        total + (piece ? ({ q: 4, r: 2, b: 1, n: 1, p: 0, k: 0 }[piece.type] ?? 0) : 0),
      0,
    );
  if (phase <= 8) return 'endgame';
  if (/[x+#=]/.test(bestMoveSan)) return 'tactical';
  return 'positional';
}

export function moveToUci(move: MoveInput): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

export function moveToSan(fen: string, move: MoveInput): string {
  const played = new Chess(fen).move(move);
  return played.san;
}

export function trainingPositions(
  game: ImportedGame,
  analysis: GameAnalysis | null,
): TrainingPosition[] {
  if (!analysis) return [];
  const positions: TrainingPosition[] = [];
  for (const move of analysis.moves) {
    if (move.classification === 'good' || !move.category) continue;
    const importedMove = game.moves.find((candidate) => candidate.ply === move.ply);
    if (!importedMove) continue;
    positions.push({
      importedGameKey: game.key,
      ply: move.ply,
      fen: importedMove.fenBefore,
      category: move.category,
      classification: move.classification,
      playedMove: move.playedMove,
      bestMove: move.bestMove,
      bestMoveSan: move.bestMoveSan,
      principalVariation: move.principalVariation,
    });
  }
  return positions;
}

export function learningPriorities(analyses: GameAnalysis[]): LearningPriority[] {
  const byCategory = new Map<MistakeCategory, { moments: number; games: Set<string> }>();
  for (const analysis of analyses.filter((candidate) => candidate.status === 'complete')) {
    for (const category of new Set(
      analysis.moves
        .filter((move) => move.classification !== 'good')
        .map((move) => move.category)
        .filter((category): category is MistakeCategory => category !== undefined),
    )) {
      const record = byCategory.get(category) ?? { moments: 0, games: new Set<string>() };
      record.games.add(analysis.importedGameKey);
      record.moments += analysis.moves.filter(
        (move) => move.classification !== 'good' && move.category === category,
      ).length;
      byCategory.set(category, record);
    }
  }

  return [...byCategory.entries()]
    .filter(([, value]) => value.games.size >= 2)
    .map(([category, value]) => ({
      category,
      moments: value.moments,
      games: value.games.size,
      advice: ADVICE[category],
    }))
    .sort(
      (left, right) => right.moments - left.moments || left.category.localeCompare(right.category),
    );
}

export function learnerColorForGame(
  game: ImportedGame,
  profiles: ImportedProfile[],
): ChessColor | undefined {
  if (game.learnerColor) return game.learnerColor;
  const profile = profiles.find((item) => item.platform === game.platform);
  if (!profile) return undefined;
  const username = profile.username.toLowerCase();
  if (game.white.username.toLowerCase() === username) return 'white';
  if (game.black.username.toLowerCase() === username) return 'black';
  return undefined;
}

export function categoryLabel(category: MistakeCategory): string {
  return {
    opening: 'Opening decisions',
    tactical: 'Tactical awareness',
    positional: 'Positional choices',
    endgame: 'Endgame technique',
  }[category];
}

export async function analysisFingerprint(
  game: ImportedGame,
  learnerColor: ChessColor,
): Promise<string> {
  const source = JSON.stringify({
    key: game.key,
    learnerColor,
    moves: game.moves.map((move) => [move.uci, move.fenBefore]),
    schema: ANALYSIS_SCHEMA_VERSION,
    engine: ANALYSIS_ENGINE_VERSION,
    depth: ANALYSIS_DEPTH,
    thresholds: CLASSIFICATION_THRESHOLDS,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function moveAnalysisForPly(
  analysis: GameAnalysis | null,
  ply: number,
): MoveAnalysis | undefined {
  return (analysis?.reviewMoves ?? analysis?.moves)?.find((move) => move.ply === ply);
}

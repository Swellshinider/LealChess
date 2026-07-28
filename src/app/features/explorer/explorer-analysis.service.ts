import { Injectable, InjectionToken, inject } from '@angular/core';
import { Chess, type Square } from 'chess.js';
import type {
  AnalysisEnginePort,
  AnalysisVariation,
  PositionAnalysisResult,
} from '../../core/engine/analysis-engine.types';
import type { MoveInput, PromotionPiece } from '../../core/game/game.types';
import { moveToSan, moveToUci } from '../coach/analysis/analysis-rules';
import { isOpeningPosition } from '../coach/analysis/opening-index';
import { classifyReviewMove } from '../coach/analysis/review-classification';
import type { ImportedMove } from '../coach/domain/coach.types';
import type {
  ExplorerCandidateLine,
  ExplorerMoveAnalysisRequest,
  ExplorerMoveAssessment,
} from './explorer.types';

export const EXPLORER_ANALYSIS_ENGINE_PORT = new InjectionToken<AnalysisEnginePort>(
  'EXPLORER_ANALYSIS_ENGINE_PORT',
);

@Injectable()
export class ExplorerAnalysisService {
  private readonly engine = inject(EXPLORER_ANALYSIS_ENGINE_PORT);
  private readonly positionCache = new Map<string, PositionAnalysisResult>();
  private readonly forcedMoveCache = new Map<string, PositionAnalysisResult>();

  async candidates(
    fen: string,
    depth: number,
    signal: AbortSignal,
  ): Promise<ExplorerCandidateLine[]> {
    if (new Chess(fen).isGameOver()) return [];
    return candidateLines(fen, await this.positionAnalysis(fen, depth, signal, 3));
  }

  async assessMove(
    request: ExplorerMoveAnalysisRequest,
    depth: number,
    signal: AbortSignal,
  ): Promise<ExplorerMoveAssessment> {
    const best = await this.positionAnalysis(request.fenBefore, depth, signal, 2);
    if (!best.bestMove) throw new Error('Stockfish returned no best move for this position.');
    const uci = moveToUci(request.move);
    const played =
      moveToUci(best.bestMove) === uci
        ? best
        : await this.forcedMoveAnalysis(request.fenBefore, uci, depth, signal);
    const importedMove: ImportedMove = {
      ply: 1,
      color: request.color,
      san: request.san,
      from: request.move.from,
      to: request.move.to,
      uci,
      fenBefore: request.fenBefore,
      fenAfter: request.fenAfter,
    };
    return {
      classification: classifyReviewMove(
        importedMove,
        best,
        played,
        isOpeningPosition(request.fenAfter),
      ),
      depth,
      provisional: depth < 14,
      bestMove: moveToUci(best.bestMove),
      bestMoveSan: moveToSan(request.fenBefore, best.bestMove),
      bestEvaluation: best.evaluation,
      playedEvaluation: played.evaluation,
    };
  }

  destroy(): void {
    this.positionCache.clear();
    this.forcedMoveCache.clear();
    this.engine.destroy();
  }

  private async positionAnalysis(
    fen: string,
    depth: number,
    signal: AbortSignal,
    multiPv: number,
  ): Promise<PositionAnalysisResult> {
    const key = `${depth}:${multiPv}:${fen}`;
    const cached = this.positionCache.get(key);
    if (cached) return cached;
    const result = await this.engine.analyze({ fen, depth, multiPv, signal });
    this.positionCache.set(key, result);
    return result;
  }

  private async forcedMoveAnalysis(
    fen: string,
    move: string,
    depth: number,
    signal: AbortSignal,
  ): Promise<PositionAnalysisResult> {
    const key = `${depth}:${fen}:${move}`;
    const cached = this.forcedMoveCache.get(key);
    if (cached) return cached;
    const result = await this.engine.analyze({ fen, depth, searchMove: move, signal });
    this.forcedMoveCache.set(key, result);
    return result;
  }
}

function candidateLines(fen: string, result: PositionAnalysisResult): ExplorerCandidateLine[] {
  const variations = result.variations?.length
    ? result.variations
    : [
        {
          rank: 1,
          evaluation: result.evaluation,
          principalVariation: result.principalVariation,
        },
      ];
  return variations
    .slice(0, 3)
    .map((variation) => candidateLine(fen, variation))
    .filter((line): line is ExplorerCandidateLine => line !== null);
}

function candidateLine(fen: string, variation: AnalysisVariation): ExplorerCandidateLine | null {
  const firstMove = parseUci(variation.principalVariation[0]);
  if (!firstMove) return null;
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of variation.principalVariation.slice(0, 8)) {
    const move = parseUci(uci);
    if (!move) break;
    try {
      san.push(chess.move(move).san);
    } catch {
      break;
    }
  }
  return {
    rank: variation.rank,
    evaluation: variation.evaluation,
    firstMove,
    san,
  };
}

function parseUci(uci?: string): MoveInput | null {
  if (!uci || uci.length < 4) return null;
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    ...(uci[4] ? { promotion: uci[4] as PromotionPiece } : {}),
  };
}

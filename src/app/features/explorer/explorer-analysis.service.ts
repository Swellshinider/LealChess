import { Injectable, InjectionToken, inject } from '@angular/core';
import { Chess } from 'chess.js';
import type {
  AnalysisEnginePort,
  PositionAnalysisResult,
} from '../../core/engine/analysis-engine.types';
import { candidateLines, moveToSan, moveToUci } from '../../core/game/chess-move';
import { isOpeningPosition } from '../coach/analysis/opening-index';
import { classifyReviewMove } from '../coach/analysis/review-classification';
import type { ImportedMove } from '../coach/domain/coach.types';
import type {
  ExplorerCandidateLine,
  ExplorerMoveAnalysisRequest,
  ExplorerMoveAssessment,
} from './explorer.types';
import { AnalysisSettingsService } from '../../core/engine/analysis-settings.service';
import {
  analysisProfileFingerprint,
  type AnalysisProfile,
} from '../../core/engine/analysis-profiles';

export const EXPLORER_ANALYSIS_ENGINE_PORT = new InjectionToken<AnalysisEnginePort>(
  'EXPLORER_ANALYSIS_ENGINE_PORT',
);

@Injectable()
export class ExplorerAnalysisService {
  private readonly engine = inject(EXPLORER_ANALYSIS_ENGINE_PORT);
  private readonly settings = inject(AnalysisSettingsService);
  private readonly positionCache = new Map<string, PositionAnalysisResult>();
  private readonly forcedMoveCache = new Map<string, PositionAnalysisResult>();

  async candidates(
    fen: string,
    depth: number,
    signal: AbortSignal,
    profile?: AnalysisProfile,
  ): Promise<ExplorerCandidateLine[]> {
    if (new Chess(fen).isGameOver()) return [];
    const selected = profile ?? (await this.settings.profile('explorer'));
    await this.engine.initialize(selected.engineId);
    return candidateLines(
      fen,
      await this.positionAnalysis(fen, depth, signal, selected.lines, selected),
      8,
    );
  }

  async assessMove(
    request: ExplorerMoveAnalysisRequest,
    depth: number,
    signal: AbortSignal,
    profile?: AnalysisProfile,
  ): Promise<ExplorerMoveAssessment> {
    const selected = profile ?? (await this.settings.profile('explorer'));
    await this.engine.initialize(selected.engineId);
    const best = await this.positionAnalysis(
      request.fenBefore,
      depth,
      signal,
      selected.lines,
      selected,
    );
    if (!best.bestMove) throw new Error('Stockfish returned no best move for this position.');
    const uci = moveToUci(request.move);
    const played =
      moveToUci(best.bestMove) === uci
        ? best
        : await this.forcedMoveAnalysis(request.fenBefore, uci, depth, signal, selected);
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
      provisional: depth < selected.depth,
      profileFingerprint: analysisProfileFingerprint(selected),
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
    profile: AnalysisProfile,
  ): Promise<PositionAnalysisResult> {
    const key = `${analysisProfileFingerprint(profile)}:${depth}:${multiPv}:${fen}`;
    const cached = this.positionCache.get(key);
    if (cached) return cached;
    const result = await this.engine.analyze({
      fen,
      engineId: profile.engineId,
      depth,
      multiPv,
      signal,
    });
    this.positionCache.set(key, result);
    return result;
  }

  private async forcedMoveAnalysis(
    fen: string,
    move: string,
    depth: number,
    signal: AbortSignal,
    profile: AnalysisProfile,
  ): Promise<PositionAnalysisResult> {
    const key = `${analysisProfileFingerprint(profile)}:${depth}:${fen}:${move}`;
    const cached = this.forcedMoveCache.get(key);
    if (cached) return cached;
    const result = await this.engine.analyze({
      fen,
      engineId: profile.engineId,
      depth,
      searchMove: move,
      signal,
    });
    this.forcedMoveCache.set(key, result);
    return result;
  }
}

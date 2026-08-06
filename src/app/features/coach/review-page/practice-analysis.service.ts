import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Chess } from 'chess.js';
import type {
  AnalysisEnginePort,
  PositionAnalysisResult,
} from '../../../core/engine/analysis-engine.types';
import { candidateLines, moveToUci } from '../../../core/game/chess-move';
import { loadOpeningBook } from '../../../core/openings/opening-book';
import { classifyReviewMove } from '../../../core/analysis/move-classification';
import type { ImportedMove } from '../domain/coach.types';
import type {
  PracticeAnalysisRequest,
  PracticeAnalysisResult,
  PracticeAnalysisState,
} from './practice.types';
import { AnalysisSettingsService } from '../../../core/engine/analysis-settings.service';
import {
  analysisProfileFingerprint,
  type AnalysisProfile,
} from '../../../core/engine/analysis-profiles';

export const PRACTICE_ANALYSIS_ENGINE_PORT = new InjectionToken<AnalysisEnginePort>(
  'PRACTICE_ANALYSIS_ENGINE_PORT',
);

@Injectable()
export class PracticeAnalysisService {
  private readonly engine = inject(PRACTICE_ANALYSIS_ENGINE_PORT);
  private readonly settings = inject(AnalysisSettingsService);
  private readonly mutableState = signal<PracticeAnalysisState>({ phase: 'idle' });
  private readonly positionCache = new Map<string, PositionAnalysisResult>();
  private abortController: AbortController | null = null;
  private requestId = 0;

  readonly state = this.mutableState.asReadonly();

  analyze(request: PracticeAnalysisRequest): void {
    this.cancel();
    const requestId = ++this.requestId;
    const abortController = new AbortController();
    this.abortController = abortController;
    this.mutableState.set({ phase: 'quick', nodeId: request.nodeId });
    void this.run(request, requestId, abortController);
  }

  retry(request: PracticeAnalysisRequest): void {
    this.analyze(request);
  }

  cancel(): void {
    this.requestId += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.mutableState.set({ phase: 'idle' });
  }

  destroy(): void {
    this.cancel();
    this.positionCache.clear();
    this.engine.destroy();
  }

  private async run(
    request: PracticeAnalysisRequest,
    requestId: number,
    abortController: AbortController,
  ): Promise<void> {
    let quickResult: PracticeAnalysisResult | undefined;
    try {
      const profile = await this.settings.profile('practice');
      await this.engine.initialize(profile.engineId);
      quickResult = await this.analyzeAtDepth(request, 10, abortController.signal, profile);
      if (!this.isCurrent(requestId)) return;
      if (profile.depth === 10) {
        this.mutableState.set({ phase: 'complete', nodeId: request.nodeId, result: quickResult });
        return;
      }
      this.mutableState.set({
        phase: 'refining',
        nodeId: request.nodeId,
        result: quickResult,
      });
      const refined = await this.analyzeAtDepth(
        request,
        profile.depth,
        abortController.signal,
        profile,
      );
      if (!this.isCurrent(requestId)) return;
      this.mutableState.set({
        phase: 'complete',
        nodeId: request.nodeId,
        result: refined,
      });
    } catch (error) {
      if (isAbort(error) || !this.isCurrent(requestId)) return;
      this.mutableState.set({
        phase: 'error',
        nodeId: request.nodeId,
        ...(quickResult ? { result: quickResult } : {}),
        error:
          error instanceof Error
            ? error.message
            : 'Stockfish could not analyze this practice move.',
      });
    }
  }

  private async analyzeAtDepth(
    request: PracticeAnalysisRequest,
    depth: number,
    signal: AbortSignal,
    profile: AnalysisProfile,
  ): Promise<PracticeAnalysisResult> {
    const openingBook = await loadOpeningBook();
    const best = await this.positionAnalysis(request.fenBefore, depth, signal, profile);
    const played =
      best.bestMove && moveToUci(best.bestMove) === moveToUci(request.move)
        ? best
        : await this.engine.analyze({
            fen: request.fenBefore,
            engineId: profile.engineId,
            depth,
            searchMove: moveToUci(request.move),
            signal,
          });
    const importedMove: ImportedMove = {
      ply: 1,
      color: request.color,
      san: request.san,
      from: request.move.from,
      to: request.move.to,
      uci: moveToUci(request.move),
      fenBefore: request.fenBefore,
      fenAfter: request.fenAfter,
    };
    const classification = classifyReviewMove(
      importedMove,
      best,
      played,
      openingBook.isOpeningPosition(request.fenAfter),
    );
    const candidates = new Chess(request.fenAfter).isGameOver()
      ? []
      : candidateLines(
          request.fenAfter,
          await this.positionAnalysis(request.fenAfter, depth, signal, profile),
          6,
        );
    return {
      assessment: {
        classification,
        depth,
        provisional: depth < profile.depth,
      },
      candidates,
      profileFingerprint: analysisProfileFingerprint(profile),
    };
  }

  private async positionAnalysis(
    fen: string,
    depth: number,
    signal: AbortSignal,
    profile: AnalysisProfile,
  ): Promise<PositionAnalysisResult> {
    const key = `${analysisProfileFingerprint(profile)}:${depth}:${fen}`;
    const cached = this.positionCache.get(key);
    if (cached) return cached;
    const result = await this.engine.analyze({
      fen,
      engineId: profile.engineId,
      depth,
      multiPv: profile.lines,
      signal,
    });
    this.positionCache.set(key, result);
    return result;
  }

  private isCurrent(requestId: number): boolean {
    return requestId === this.requestId;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

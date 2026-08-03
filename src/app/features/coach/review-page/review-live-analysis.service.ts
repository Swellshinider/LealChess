import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Chess } from 'chess.js';
import type {
  AnalysisEnginePort,
  PositionAnalysisResult,
  PositionAnalysisSnapshot,
} from '../../../core/engine/analysis-engine.types';
import { candidateLines } from '../../../core/game/chess-move';
import type { ReviewCandidateLine } from './review-analysis-session.types';
import { AnalysisSettingsService } from '../../../core/engine/analysis-settings.service';
import { analysisProfileFingerprint } from '../../../core/engine/analysis-profiles';

export const REVIEW_LIVE_ANALYSIS_ENGINE_PORT = new InjectionToken<AnalysisEnginePort>(
  'REVIEW_LIVE_ANALYSIS_ENGINE_PORT',
);

export interface ReviewLiveAnalysisState {
  phase: 'idle' | 'analyzing' | 'complete' | 'error';
  nodeId?: string;
  depth?: number;
  candidates: ReviewCandidateLine[];
  error?: string;
  profileFingerprint?: string;
}

@Injectable()
export class ReviewLiveAnalysisService {
  private readonly engine = inject(REVIEW_LIVE_ANALYSIS_ENGINE_PORT);
  private readonly settings = inject(AnalysisSettingsService);
  private controller: AbortController | null = null;
  private generation = 0;
  readonly state = signal<ReviewLiveAnalysisState>({ phase: 'idle', candidates: [] });

  analyze(nodeId: string, fen: string): void {
    this.cancel();
    if (new Chess(fen).isGameOver()) {
      this.state.set({ phase: 'complete', nodeId, candidates: [] });
      return;
    }
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.state.set({ phase: 'analyzing', nodeId, candidates: [] });
    void this.runAnalysis(generation, nodeId, fen, controller);
  }

  private async runAnalysis(
    generation: number,
    nodeId: string,
    fen: string,
    controller: AbortController,
  ): Promise<void> {
    try {
      const profile = await this.settings.profile('live-analysis');
      await this.engine.initialize(profile.engineId);
      const result = await this.engine.analyze({
        fen,
        engineId: profile.engineId,
        depth: profile.depth,
        multiPv: profile.lines,
        signal: controller.signal,
        onProgress: (snapshot) => this.handleProgress(generation, nodeId, fen, snapshot),
      });
      if (generation !== this.generation || controller.signal.aborted) return;
      this.state.set({
        phase: 'complete',
        nodeId,
        depth: result.evaluation.depth,
        candidates: candidateLines(fen, result, 8),
        profileFingerprint: analysisProfileFingerprint(profile),
      });
    } catch (error) {
      if (generation !== this.generation || isAbort(error)) return;
      this.state.set({
        phase: 'error',
        nodeId,
        candidates: this.state().nodeId === nodeId ? this.state().candidates : [],
        depth: this.state().nodeId === nodeId ? this.state().depth : undefined,
        error: error instanceof Error ? error.message : 'Stockfish analysis failed.',
      });
    }
  }

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }

  destroy(): void {
    this.cancel();
    this.engine.destroy();
  }

  private handleProgress(
    generation: number,
    nodeId: string,
    fen: string,
    snapshot: PositionAnalysisSnapshot,
  ): void {
    if (generation !== this.generation || this.controller?.signal.aborted) return;
    const result: PositionAnalysisResult = {
      bestMove:
        candidateLines(
          fen,
          {
            bestMove: null,
            evaluation: snapshot.evaluation,
            principalVariation: snapshot.variations[0]?.principalVariation ?? [],
            variations: snapshot.variations,
          },
          1,
        )[0]?.firstMove ?? null,
      evaluation: snapshot.evaluation,
      principalVariation: snapshot.variations[0]?.principalVariation ?? [],
      variations: snapshot.variations,
    };
    this.state.set({
      phase: 'analyzing',
      nodeId,
      depth: snapshot.depth,
      candidates: candidateLines(fen, result, 8),
    });
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

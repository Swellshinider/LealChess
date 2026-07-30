import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Chess } from 'chess.js';
import type {
  AnalysisEnginePort,
  PositionAnalysisResult,
  PositionAnalysisSnapshot,
} from '../../../core/engine/analysis-engine.types';
import { candidateLines } from '../../../core/game/chess-move';
import type { ReviewCandidateLine } from './review-analysis-session.types';

export const REVIEW_LIVE_ANALYSIS_ENGINE_PORT = new InjectionToken<AnalysisEnginePort>(
  'REVIEW_LIVE_ANALYSIS_ENGINE_PORT',
);

export interface ReviewLiveAnalysisState {
  phase: 'idle' | 'analyzing' | 'complete' | 'error';
  nodeId?: string;
  depth?: number;
  candidates: ReviewCandidateLine[];
  error?: string;
}

@Injectable()
export class ReviewLiveAnalysisService {
  private readonly engine = inject(REVIEW_LIVE_ANALYSIS_ENGINE_PORT);
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
    void this.engine
      .analyze({
        fen,
        depth: 16,
        multiPv: 3,
        signal: controller.signal,
        onProgress: (snapshot) => this.handleProgress(generation, nodeId, fen, snapshot),
      })
      .then((result) => {
        if (generation !== this.generation || controller.signal.aborted) return;
        const candidates = candidateLines(fen, result, 8);
        this.state.set({
          phase: 'complete',
          nodeId,
          depth: result.evaluation.depth,
          candidates,
        });
      })
      .catch((error: unknown) => {
        if (generation !== this.generation || isAbort(error)) return;
        this.state.set({
          phase: 'error',
          nodeId,
          candidates: this.state().nodeId === nodeId ? this.state().candidates : [],
          depth: this.state().nodeId === nodeId ? this.state().depth : undefined,
          error: error instanceof Error ? error.message : 'Stockfish analysis failed.',
        });
      });
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

import { InjectionToken } from '@angular/core';
import type { AnalysisEnginePort } from '../../../core/engine/analysis-engine.types';

export const BATCH_ANALYSIS_ENGINE_PORT = new InjectionToken<AnalysisEnginePort>(
  'BATCH_ANALYSIS_ENGINE_PORT',
);

export type BatchAnalysisPhase =
  'idle' | 'starting' | 'running' | 'cancelled' | 'complete' | 'error';

export interface BatchAnalysisState {
  phase: BatchAnalysisPhase;
  total: number;
  completed: number;
  failed: number;
  currentIndex: number;
  currentGameKey: string | null;
  currentMoves: { completed: number; total: number };
  error: string | null;
}

import { InjectionToken } from '@angular/core';
import type { MoveInput } from '../game/game.types';
import type { EngineEvaluation } from '../../features/coach/domain/coach.types';

export interface PositionAnalysisRequest {
  fen: string;
  depth: number;
  searchMove?: string;
  signal?: AbortSignal;
}

export interface PositionAnalysisResult {
  bestMove: MoveInput | null;
  evaluation: EngineEvaluation;
  principalVariation: string[];
}

export interface AnalysisEnginePort {
  analyze(request: PositionAnalysisRequest): Promise<PositionAnalysisResult>;
  destroy(): void;
}

export const ANALYSIS_ENGINE_PORT = new InjectionToken<AnalysisEnginePort>('ANALYSIS_ENGINE_PORT');

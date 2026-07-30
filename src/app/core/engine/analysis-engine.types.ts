import { InjectionToken } from '@angular/core';
import type { MoveInput } from '../game/game.types';
import type { EngineEvaluation } from '../../features/coach/domain/coach.types';

export interface PositionAnalysisRequest {
  fen: string;
  depth: number;
  searchMove?: string;
  signal?: AbortSignal;
  multiPv?: number;
  onProgress?: (snapshot: PositionAnalysisSnapshot) => void;
}

export interface AnalysisVariation {
  rank: number;
  evaluation: EngineEvaluation;
  principalVariation: string[];
  expectedPoints?: number;
}

export interface PositionAnalysisResult {
  bestMove: MoveInput | null;
  evaluation: EngineEvaluation;
  principalVariation: string[];
  expectedPoints?: number;
  variations?: AnalysisVariation[];
}

export interface PositionAnalysisSnapshot {
  depth: number;
  evaluation: EngineEvaluation;
  variations: AnalysisVariation[];
}

export interface AnalysisEnginePort {
  initialize(): Promise<void>;
  analyze(request: PositionAnalysisRequest): Promise<PositionAnalysisResult>;
  destroy(): void;
}

export const ANALYSIS_ENGINE_PORT = new InjectionToken<AnalysisEnginePort>('ANALYSIS_ENGINE_PORT');

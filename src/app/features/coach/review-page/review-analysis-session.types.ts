import type { MoveInput } from '../../../core/game/game.types';
import type { ChessColor } from '../../../shared/chess/chess.types';
import type { EngineEvaluation } from '../../../core/engine/analysis-engine.types';

export const REVIEW_ANALYSIS_SESSION_SCHEMA_VERSION = 1;
export const REVIEW_ANALYSIS_VERSION = 'stockfish-18-multipv-3-depth-16-v1';

export type ReviewMoveSource = 'imported' | 'manual';

export interface ReviewCandidateLine {
  rank: number;
  evaluation: EngineEvaluation;
  firstMove: MoveInput;
  san: string[];
}

export interface ReviewMoveNode {
  id: string;
  parentId: string | null;
  children: string[];
  fen: string;
  ply: number;
  move?: MoveInput;
  san?: string;
  color?: ChessColor;
  source?: ReviewMoveSource;
  importedPly?: number;
  candidates: ReviewCandidateLine[];
  candidateDepth?: number;
  profileFingerprint?: string;
  analysisError?: string;
}

export interface ReviewAnalysisSession {
  importedGameKey: string;
  schemaVersion: typeof REVIEW_ANALYSIS_SESSION_SCHEMA_VERSION;
  analysisVersion: string;
  mainlineFingerprint: string;
  rootId: 'root';
  selectedNodeId: string;
  nodes: Record<string, ReviewMoveNode>;
  updatedAt: string;
}

import type { MoveInput } from '../../../core/game/game.types';
import type { ChessColor } from '../../../shared/chess/chess.types';
import type { TrainingPosition } from '../domain/coach.types';
import type { ReviewMoveClassification } from '../../../core/analysis/move-classification.types';
import type { EngineEvaluation } from '../../../core/engine/analysis-engine.types';

export type PracticeAnalysisPhase = 'idle' | 'quick' | 'refining' | 'complete' | 'error';

export interface PracticeCandidateLine {
  rank: number;
  evaluation: EngineEvaluation;
  firstMove: MoveInput;
  san: string[];
}

export interface PracticeMoveAssessment {
  classification: ReviewMoveClassification;
  depth: number;
  provisional: boolean;
}

export interface PracticeAnalysisResult {
  assessment: PracticeMoveAssessment;
  candidates: PracticeCandidateLine[];
  profileFingerprint?: string;
}

export interface PracticeAnalysisRequest {
  nodeId: string;
  fenBefore: string;
  fenAfter: string;
  move: MoveInput;
  san: string;
  color: ChessColor;
}

export interface PracticeAnalysisState {
  phase: PracticeAnalysisPhase;
  nodeId?: string;
  result?: PracticeAnalysisResult;
  error?: string;
}

export interface PracticeVariationNode {
  id: string;
  parentId: string | null;
  fen: string;
  ply: number;
  children: string[];
  move?: MoveInput;
  san?: string;
  color?: ChessColor;
  assessment?: PracticeMoveAssessment;
  candidates: PracticeCandidateLine[];
  candidateDepth?: number;
  profileFingerprint?: string;
  analysisError?: string;
}

export interface PracticeSession {
  key: string;
  position: TrainingPosition;
  rootId: string;
  selectedNodeId: string;
  nodes: Record<string, PracticeVariationNode>;
}

export interface PracticeMoveCommit {
  session: PracticeSession;
  node: PracticeVariationNode;
  created: boolean;
}

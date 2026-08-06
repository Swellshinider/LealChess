import type { PieceSymbol, Square } from 'chess.js';
import type { ReviewMoveClassification } from '../coach/domain/coach.types';
import type { EngineEvaluation } from '../../core/engine/analysis-engine.types';
import type { MoveInput } from '../../core/game/game.types';
import type { ChessColor } from '../../shared/chess/chess.types';

export const EXPLORER_SESSION_SCHEMA_VERSION = 1;
export const EXPLORER_ANALYSIS_VERSION = 'stockfish-18-single-depth-14-classification-2';

export type ExplorerSource = 'starting-position' | 'fen' | 'pgn' | 'setup';
export type ExplorerMoveSource = 'imported' | 'manual';
export type ExplorerBatchStatus = 'idle' | 'running' | 'paused' | 'complete' | 'error';

export interface ExplorerCandidateLine {
  rank: number;
  evaluation: EngineEvaluation;
  firstMove: MoveInput;
  san: string[];
}

export interface ExplorerMoveAssessment {
  classification: ReviewMoveClassification;
  depth: number;
  provisional: boolean;
  profileFingerprint?: string;
  bestMove: string;
  bestMoveSan: string;
  bestEvaluation: EngineEvaluation;
  playedEvaluation: EngineEvaluation;
}

export interface ExplorerMoveNode {
  id: string;
  parentId: string | null;
  fen: string;
  profileFingerprint?: string;
  ply: number;
  children: string[];
  move?: MoveInput;
  san?: string;
  color?: ChessColor;
  source?: ExplorerMoveSource;
  assessment?: ExplorerMoveAssessment;
  candidates: ExplorerCandidateLine[];
  candidateDepth?: number;
  analysisError?: string;
}

export interface ExplorerBatchState {
  status: ExplorerBatchStatus;
  completed: number;
  total: number;
  error?: string;
}

export interface ExplorerSession {
  id: 'active';
  schemaVersion: typeof EXPLORER_SESSION_SCHEMA_VERSION;
  analysisVersion: string;
  profileFingerprint?: string;
  source: ExplorerSource;
  rootFen: string;
  rootId: string;
  selectedNodeId: string;
  nodes: Record<string, ExplorerMoveNode>;
  orientation: ChessColor;
  batch: ExplorerBatchState;
  updatedAt: string;
}

export interface ExplorerSetupState {
  pieces: Partial<Record<Square, { color: 'w' | 'b'; type: PieceSymbol }>>;
  turn: 'w' | 'b';
  castling: {
    whiteKing: boolean;
    whiteQueen: boolean;
    blackKing: boolean;
    blackQueen: boolean;
  };
  enPassant: '-' | Square;
}

export interface ExplorerPgnMove {
  move: MoveInput;
  san: string;
  color: ChessColor;
  fenBefore: string;
  fenAfter: string;
}

export interface ExplorerPgnResult {
  ok: boolean;
  rootFen?: string;
  moves?: ExplorerPgnMove[];
  error?: string;
}

export interface ExplorerMoveAnalysisRequest {
  nodeId: string;
  fenBefore: string;
  fenAfter: string;
  move: MoveInput;
  san: string;
  color: ChessColor;
}

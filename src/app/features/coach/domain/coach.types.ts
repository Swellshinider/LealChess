import type { Square } from 'chess.js';
import type { ChessColor } from '../../../shared/chess/chess.types';

export type ChessPlatform = 'chess-com' | 'lichess';
export type GameSource = ChessPlatform | 'local';
export type SpeedFilter = 'any' | 'bullet' | 'blitz' | 'rapid' | 'classical-daily';
export type ImportState = 'idle' | 'loading' | 'success' | 'warning' | 'error';
export type ParseStatus = 'ready' | 'unsupported-variant' | 'invalid-pgn' | 'unavailable';

export interface ImportedProfile {
  platform: ChessPlatform;
  username: string;
  displayName: string;
  profileUrl: string;
  avatarUrl?: string;
  updatedAt: string;
}

export interface PlatformPlayer {
  username: string;
  rating?: number;
  result?: string;
}

export interface OpeningInfo {
  eco?: string;
  name: string;
}

export interface ImportedMove {
  ply: number;
  color: ChessColor;
  san: string;
  from: Square;
  to: Square;
  uci: string;
  fenBefore: string;
  fenAfter: string;
}

export interface ImportedGame {
  key: string;
  platform: GameSource;
  platformGameId: string;
  platformUrl: string;
  pgn: string;
  variant: string;
  white: PlatformPlayer;
  black: PlatformPlayer;
  result: string;
  speed: string;
  timeControl: string;
  rated: boolean;
  endTime: string;
  opening?: OpeningInfo;
  moves: ImportedMove[];
  parseStatus: ParseStatus;
  parseError?: string;
  profileKeys: string[];
  firstImportedAt: string;
  lastImportedAt: string;
  learnerColor?: ChessColor;
  botRating?: number;
}

export interface ImportRequest {
  chessComUsername: string;
  lichessUsername: string;
  maxGames: number;
  speed: SpeedFilter;
}

export interface PlatformImportStatus {
  platform: ChessPlatform;
  state: ImportState;
  message: string;
  counts: ImportOutcomeCounts;
  recovery?: string;
  canRetry: boolean;
}

export interface ImportOutcomeCounts {
  added: number;
  duplicates: number;
  unavailable: number;
  skipped: number;
}

export interface ImportSummary {
  total: number;
  wins: number;
  draws: number;
  losses: number;
  asWhite: { wins: number; draws: number; losses: number };
  asBlack: { wins: number; draws: number; losses: number };
  topOpenings: Array<{ name: string; eco?: string; count: number }>;
}

export interface PgnParseResult {
  status: ParseStatus;
  moves: ImportedMove[];
  error?: string;
}

export type MoveClassification = 'good' | 'inaccuracy' | 'mistake' | 'blunder';
export type ReviewMoveClassification =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';
export type ConcernMoveClassification = Extract<
  ReviewMoveClassification,
  'inaccuracy' | 'mistake' | 'miss' | 'blunder'
>;
export type MistakeCategory = 'opening' | 'tactical' | 'positional' | 'endgame';
export type AnalysisStatus = 'partial' | 'complete';

export interface EngineEvaluation {
  score: { kind: 'centipawn'; value: number } | { kind: 'mate'; moves: number };
  depth: number;
}

export interface MoveAnalysis {
  importedGameKey: string;
  ply: number;
  playedMove: string;
  bestMove: string;
  bestMoveSan: string;
  principalVariation: string[];
  playedPrincipalVariation?: string[];
  bestEvaluation: EngineEvaluation;
  playedEvaluation: EngineEvaluation;
  centipawnLoss?: number;
  classification: MoveClassification;
  reviewClassification: ReviewMoveClassification;
  category?: MistakeCategory;
}

export interface GameAnalysis {
  importedGameKey: string;
  schemaVersion: number;
  sourceFingerprint: string;
  engineVersion: string;
  depth: number;
  profileFingerprint?: string;
  learnerColor: ChessColor;
  status: AnalysisStatus;
  totalUserMoves: number;
  moves: MoveAnalysis[];
  reviewMoves?: MoveAnalysis[];
  updatedAt: string;
  completedAt?: string;
}

export interface TrainingPosition {
  importedGameKey: string;
  ply: number;
  fen: string;
  category: MistakeCategory;
  classification: ConcernMoveClassification;
  playedMove: string;
  bestMove: string;
  bestMoveSan: string;
  principalVariation: string[];
}

export interface LearningPriority {
  category: MistakeCategory;
  moments: number;
  games: number;
  advice: string;
}

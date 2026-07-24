import type { Square } from 'chess.js';
import type { ChessColor } from '../../../shared/chess/chess.types';

export type ChessPlatform = 'chess-com' | 'lichess';
export type SpeedFilter = 'any' | 'bullet' | 'blitz' | 'rapid' | 'classical-daily';
export type ImportState = 'idle' | 'loading' | 'success' | 'warning' | 'error';
export type ParseStatus = 'ready' | 'unsupported-variant' | 'invalid-pgn';

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
  platform: ChessPlatform;
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
  importedCount: number;
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

export type MistakeSeverity = 'inaccuracy' | 'mistake' | 'blunder';
export type MistakeCategory = 'opening' | 'tactical' | 'positional' | 'endgame' | 'time-management';

export interface EngineEvaluation {
  centipawns?: number;
  mateIn?: number;
  depth: number;
}

export interface MoveAnalysis {
  importedGameKey: string;
  ply: number;
  before: EngineEvaluation;
  after: EngineEvaluation;
  severity?: MistakeSeverity;
  category?: MistakeCategory;
}

export interface GameAnalysis {
  importedGameKey: string;
  moves: MoveAnalysis[];
  analyzedAt: string;
}

export interface TrainingPosition {
  importedGameKey: string;
  ply: number;
  fen: string;
  category: MistakeCategory;
  severity: MistakeSeverity;
}

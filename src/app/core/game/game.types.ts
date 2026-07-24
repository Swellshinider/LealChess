import type { Square } from 'chess.js';
import type { ChessColor } from '../../shared/chess/chess.types';

export type { ChessColor } from '../../shared/chess/chess.types';
export type ColorSelection = ChessColor | 'random';
export type DifficultyId = 'beginner' | 'casual' | 'intermediate' | 'advanced' | 'expert';
export type BoardTheme = 'tournament' | 'classic' | 'high-contrast';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export type GamePhase = 'setup' | 'restoring' | 'active' | 'game-over';
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'thinking' | 'stopping' | 'error';
export type ResultReason =
  | 'checkmate'
  | 'resignation'
  | 'stalemate'
  | 'insufficient-material'
  | 'threefold-repetition'
  | 'fifty-move';

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

export interface PendingPremove extends MoveInput {
  positionFen: string;
}

export interface MoveRecord {
  ply: number;
  color: ChessColor;
  from: Square;
  to: Square;
  san: string;
  lan: string;
  piece: string;
  captured?: string;
  promotion?: string;
  before: string;
  after: string;
}

export interface GameResult {
  winner: ChessColor | null;
  reason: ResultReason;
  label: string;
}

export interface GamePreferences {
  soundEnabled: boolean;
  showLegalMoves: boolean;
  premovesEnabled: boolean;
  boardTheme: BoardTheme;
  orientation: ChessColor;
  difficulty: DifficultyId;
}

export interface GameViewState {
  gameId: string;
  phase: GamePhase;
  engineStatus: EngineStatus;
  engineError: string | null;
  fen: string;
  pgn: string;
  moves: readonly MoveRecord[];
  playerColor: ChessColor;
  turn: ChessColor;
  orientation: ChessColor;
  difficulty: DifficultyId;
  pendingPremove: PendingPremove | null;
  result: GameResult | null;
  lastMove: readonly [Square, Square] | null;
  checkSquare: Square | null;
  canClaimDraw: boolean;
  isPlayerTurn: boolean;
  restored: boolean;
  announcement: string;
  preferences: GamePreferences;
  legalDestinations: ReadonlyMap<Square, readonly Square[]>;
}

export interface StartGameOptions {
  colorSelection: ColorSelection;
  difficulty: DifficultyId;
}

export const DEFAULT_PREFERENCES: GamePreferences = {
  soundEnabled: true,
  showLegalMoves: true,
  premovesEnabled: true,
  boardTheme: 'tournament',
  orientation: 'white',
  difficulty: 'casual',
};

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

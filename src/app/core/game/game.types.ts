import type { Square } from 'chess.js';
import type { ChessColor } from '../../shared/chess/chess.types';
import type { BotRating } from '../engine/bot-rating';
import { DEFAULT_BOT_RATING } from '../engine/bot-rating';
import { cloneDefaultKeybindings, type KeybindingPreferences } from '../keyboard/keybindings';

export type { ChessColor } from '../../shared/chess/chess.types';
export type ColorSelection = ChessColor | 'random';
export type BoardTheme =
  'tournament' | 'classic' | 'high-contrast' | 'rosewood' | 'green-felt' | 'blue-steel';
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
  soundVolume: number;
  showLegalMoves: boolean;
  premovesEnabled: boolean;
  confirmVariationRemoval: boolean;
  boardTheme: BoardTheme;
  orientation: ChessColor;
  botRating: BotRating;
  keybindings: KeybindingPreferences;
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
  botRating: BotRating;
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
  botRating: BotRating;
}

export const DEFAULT_PREFERENCES: GamePreferences = {
  soundEnabled: true,
  soundVolume: 100,
  showLegalMoves: true,
  premovesEnabled: true,
  confirmVariationRemoval: true,
  boardTheme: 'tournament',
  orientation: 'white',
  botRating: DEFAULT_BOT_RATING,
  keybindings: cloneDefaultKeybindings(),
};

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

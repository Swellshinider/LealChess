import { InjectionToken } from '@angular/core';
import type {
  ChessColor,
  GamePreferences,
  GameResult,
  MoveRecord,
  PendingPremove,
} from '../game/game.types';
import type { BotRating } from '../engine/bot-rating';
import type { SpeedFilter } from '../../features/coach/domain/coach.types';

export const PERSISTENCE_SCHEMA_VERSION = 2;

export interface PersistedGame {
  schemaVersion: typeof PERSISTENCE_SCHEMA_VERSION;
  gameId: string;
  pgn: string;
  fen: string;
  moves: MoveRecord[];
  playerColor: ChessColor;
  orientation: ChessColor;
  botRating: BotRating;
  pendingPremove: PendingPremove | null;
  result: GameResult | null;
  updatedAt: string;
}

export interface RestoredState {
  game: PersistedGame | null;
  preferences: GamePreferences;
}

export interface ImportPreferences {
  chessComUsername: string;
  lichessUsername: string;
  maxGames: number;
  speed: SpeedFilter;
}

export const DEFAULT_IMPORT_PREFERENCES: ImportPreferences = {
  chessComUsername: '',
  lichessUsername: '',
  maxGames: 20,
  speed: 'any',
};

export interface PersistencePort {
  restore(): Promise<RestoredState>;
  saveGame(game: PersistedGame): Promise<void>;
  savePreferences(preferences: GamePreferences): Promise<void>;
  clearGame(): Promise<void>;
  flush(): Promise<void>;
}

export const PERSISTENCE_PORT = new InjectionToken<PersistencePort>('PERSISTENCE_PORT');

import { InjectionToken } from '@angular/core';
import type {
  ChessColor,
  DifficultyId,
  GamePreferences,
  GameResult,
  MoveRecord,
  PendingPremove,
} from '../game/game.types';

export const PERSISTENCE_SCHEMA_VERSION = 1;

export interface PersistedGame {
  schemaVersion: typeof PERSISTENCE_SCHEMA_VERSION;
  gameId: string;
  pgn: string;
  fen: string;
  moves: MoveRecord[];
  playerColor: ChessColor;
  orientation: ChessColor;
  difficulty: DifficultyId;
  pendingPremove: PendingPremove | null;
  result: GameResult | null;
  updatedAt: string;
}

export interface RestoredState {
  game: PersistedGame | null;
  preferences: GamePreferences;
}

export interface PersistencePort {
  restore(): Promise<RestoredState>;
  saveGame(game: PersistedGame): Promise<void>;
  savePreferences(preferences: GamePreferences): Promise<void>;
  clearGame(): Promise<void>;
  flush(): Promise<void>;
}

export const PERSISTENCE_PORT = new InjectionToken<PersistencePort>('PERSISTENCE_PORT');

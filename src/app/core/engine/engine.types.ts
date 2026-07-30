import { InjectionToken } from '@angular/core';
import type { BotRating } from './bot-rating';
import type { MoveInput } from '../game/game.types';

export interface EngineSearchRequest {
  gameId: string;
  requestId: number;
  fen: string;
  botRating: BotRating;
}

export interface EngineMove {
  gameId: string;
  requestId: number;
  fen: string;
  move: MoveInput | null;
}

export interface EnginePort {
  initialize(): Promise<void>;
  newGame(botRating: BotRating): Promise<void>;
  search(request: EngineSearchRequest): Promise<EngineMove>;
  stop(): Promise<void>;
  destroy(): void;
}

export const ENGINE_PORT = new InjectionToken<EnginePort>('ENGINE_PORT');

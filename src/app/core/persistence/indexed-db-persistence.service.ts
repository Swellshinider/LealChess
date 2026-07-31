import { Injectable, inject } from '@angular/core';
import type { IDBPDatabase } from 'idb';
import {
  DEFAULT_PREFERENCES,
  type BoardTheme,
  type ChessColor,
  type GamePreferences,
  type GameResult,
  type MoveRecord,
  type PendingPremove,
} from '../game/game.types';
import { isBotRating, legacyBotRating, normalizeBotRating } from '../engine/bot-rating';
import {
  PERSISTENCE_SCHEMA_VERSION,
  type PersistedGame,
  type PersistencePort,
  type RestoredState,
} from './persistence.types';
import { LealChessDatabaseService, type LealChessDatabase } from './leal-chess-database.service';

@Injectable()
export class IndexedDbPersistenceService implements PersistencePort {
  private readonly database = inject(LealChessDatabaseService);
  private writes = Promise.resolve();

  async restore(): Promise<RestoredState> {
    try {
      const database = await this.getDatabase();
      const [gameRecord, preferenceRecord] = await Promise.all([
        database.get('state', 'active-game'),
        database.get('state', 'preferences'),
      ]);

      return {
        game:
          gameRecord?.key === 'active-game' ? this.normalizePersistedGame(gameRecord.value) : null,
        preferences:
          preferenceRecord?.key === 'preferences'
            ? this.normalizePreferences(preferenceRecord.value)
            : { ...DEFAULT_PREFERENCES },
      };
    } catch {
      return { game: null, preferences: { ...DEFAULT_PREFERENCES } };
    }
  }

  saveGame(game: PersistedGame): Promise<void> {
    return this.queueWrite(async (database) => {
      await database.put('state', { key: 'active-game', value: structuredClone(game) });
    });
  }

  savePreferences(preferences: GamePreferences): Promise<void> {
    return this.queueWrite(async (database) => {
      await database.put('state', { key: 'preferences', value: structuredClone(preferences) });
    });
  }

  clearGame(): Promise<void> {
    return this.queueWrite(async (database) => {
      await database.delete('state', 'active-game');
    });
  }

  flush(): Promise<void> {
    return this.writes;
  }

  private getDatabase(): Promise<IDBPDatabase<LealChessDatabase>> {
    return this.database.open();
  }

  private queueWrite(
    write: (database: IDBPDatabase<LealChessDatabase>) => Promise<void>,
  ): Promise<void> {
    const queued = this.writes.then(async () => {
      const database = await this.getDatabase();
      await write(database);
    });
    this.writes = queued.catch(() => undefined);
    return queued;
  }

  private normalizePersistedGame(value: unknown): PersistedGame | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const commonFieldsAreValid =
      typeof value['gameId'] === 'string' &&
      typeof value['pgn'] === 'string' &&
      typeof value['fen'] === 'string' &&
      Array.isArray(value['moves']) &&
      value['moves'].every((move) => this.isMoveRecord(move)) &&
      this.isColor(value['playerColor']) &&
      this.isColor(value['orientation']) &&
      (value['pendingPremove'] === null || this.isPremove(value['pendingPremove'])) &&
      (value['result'] === null || this.isResult(value['result'])) &&
      typeof value['updatedAt'] === 'string';
    if (!commonFieldsAreValid) return null;

    const botRating =
      value['schemaVersion'] === PERSISTENCE_SCHEMA_VERSION && isBotRating(value['botRating'])
        ? value['botRating']
        : value['schemaVersion'] === 1
          ? legacyBotRating(value['difficulty'])
          : null;
    if (botRating === null) return null;

    return {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      gameId: value['gameId'] as string,
      pgn: value['pgn'] as string,
      fen: value['fen'] as string,
      moves: value['moves'] as MoveRecord[],
      playerColor: value['playerColor'] as ChessColor,
      orientation: value['orientation'] as ChessColor,
      botRating,
      pendingPremove: value['pendingPremove'] as PendingPremove | null,
      result: value['result'] as GameResult | null,
      updatedAt: value['updatedAt'] as string,
    };
  }

  private normalizePreferences(value: unknown): GamePreferences {
    const record = this.isRecord(value) ? value : {};
    return {
      soundEnabled:
        typeof record['soundEnabled'] === 'boolean'
          ? record['soundEnabled']
          : DEFAULT_PREFERENCES.soundEnabled,
      soundVolume: this.isSoundVolume(record['soundVolume'])
        ? record['soundVolume']
        : DEFAULT_PREFERENCES.soundVolume,
      showLegalMoves:
        typeof record['showLegalMoves'] === 'boolean'
          ? record['showLegalMoves']
          : DEFAULT_PREFERENCES.showLegalMoves,
      premovesEnabled:
        typeof record['premovesEnabled'] === 'boolean'
          ? record['premovesEnabled']
          : DEFAULT_PREFERENCES.premovesEnabled,
      boardTheme: this.isBoardTheme(record['boardTheme'])
        ? record['boardTheme']
        : DEFAULT_PREFERENCES.boardTheme,
      orientation: this.isColor(record['orientation'])
        ? record['orientation']
        : DEFAULT_PREFERENCES.orientation,
      botRating: normalizeBotRating(record['botRating'], record['difficulty']),
    };
  }

  private isMoveRecord(value: unknown): value is MoveRecord {
    return (
      this.isRecord(value) &&
      typeof value['ply'] === 'number' &&
      this.isColor(value['color']) &&
      this.isSquare(value['from']) &&
      this.isSquare(value['to']) &&
      typeof value['san'] === 'string' &&
      typeof value['lan'] === 'string' &&
      typeof value['piece'] === 'string' &&
      typeof value['before'] === 'string' &&
      typeof value['after'] === 'string'
    );
  }

  private isPremove(value: unknown): value is PendingPremove {
    return (
      this.isRecord(value) &&
      this.isSquare(value['from']) &&
      this.isSquare(value['to']) &&
      typeof value['positionFen'] === 'string' &&
      (value['promotion'] === undefined ||
        ['q', 'r', 'b', 'n'].includes(String(value['promotion'])))
    );
  }

  private isResult(value: unknown): value is GameResult {
    if (!this.isRecord(value)) {
      return false;
    }
    const reasons = [
      'checkmate',
      'resignation',
      'stalemate',
      'insufficient-material',
      'threefold-repetition',
      'fifty-move',
    ];
    return (
      (value['winner'] === null || this.isColor(value['winner'])) &&
      reasons.includes(String(value['reason'])) &&
      typeof value['label'] === 'string'
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isColor(value: unknown): value is ChessColor {
    return value === 'white' || value === 'black';
  }

  private isBoardTheme(value: unknown): value is BoardTheme {
    return [
      'tournament',
      'classic',
      'high-contrast',
      'rosewood',
      'green-felt',
      'blue-steel',
    ].includes(String(value));
  }

  private isSoundVolume(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
  }

  private isSquare(value: unknown): boolean {
    return typeof value === 'string' && /^[a-h][1-8]$/.test(value);
  }
}

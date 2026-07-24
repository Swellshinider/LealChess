import { Injectable } from '@angular/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DEFAULT_PREFERENCES,
  type BoardTheme,
  type ChessColor,
  type DifficultyId,
  type GamePreferences,
  type GameResult,
  type MoveRecord,
  type PendingPremove,
} from '../game/game.types';
import {
  PERSISTENCE_SCHEMA_VERSION,
  type PersistedGame,
  type PersistencePort,
  type RestoredState,
} from './persistence.types';

interface LealChessDatabase extends DBSchema {
  state: {
    key: 'active-game' | 'preferences';
    value:
      { key: 'active-game'; value: PersistedGame } | { key: 'preferences'; value: GamePreferences };
  };
}

@Injectable()
export class IndexedDbPersistenceService implements PersistencePort {
  private database: Promise<IDBPDatabase<LealChessDatabase>> | null = null;
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
          gameRecord?.key === 'active-game' && this.isPersistedGame(gameRecord.value)
            ? gameRecord.value
            : null,
        preferences:
          preferenceRecord?.key === 'preferences' && this.isPreferences(preferenceRecord.value)
            ? preferenceRecord.value
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
    this.database ??= openDB<LealChessDatabase>('leal-chess', 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('state')) {
          database.createObjectStore('state', { keyPath: 'key' });
        }
      },
    });
    return this.database;
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

  private isPersistedGame(value: unknown): value is PersistedGame {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      value['schemaVersion'] === PERSISTENCE_SCHEMA_VERSION &&
      typeof value['gameId'] === 'string' &&
      typeof value['pgn'] === 'string' &&
      typeof value['fen'] === 'string' &&
      Array.isArray(value['moves']) &&
      value['moves'].every((move) => this.isMoveRecord(move)) &&
      this.isColor(value['playerColor']) &&
      this.isColor(value['orientation']) &&
      this.isDifficulty(value['difficulty']) &&
      (value['pendingPremove'] === null || this.isPremove(value['pendingPremove'])) &&
      (value['result'] === null || this.isResult(value['result'])) &&
      typeof value['updatedAt'] === 'string'
    );
  }

  private isPreferences(value: unknown): value is GamePreferences {
    if (!this.isRecord(value)) {
      return false;
    }
    return (
      typeof value['soundEnabled'] === 'boolean' &&
      typeof value['showLegalMoves'] === 'boolean' &&
      typeof value['premovesEnabled'] === 'boolean' &&
      this.isBoardTheme(value['boardTheme']) &&
      this.isColor(value['orientation']) &&
      this.isDifficulty(value['difficulty'])
    );
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

  private isDifficulty(value: unknown): value is DifficultyId {
    return ['beginner', 'casual', 'intermediate', 'advanced', 'expert'].includes(String(value));
  }

  private isBoardTheme(value: unknown): value is BoardTheme {
    return ['tournament', 'classic', 'high-contrast'].includes(String(value));
  }

  private isSquare(value: unknown): boolean {
    return typeof value === 'string' && /^[a-h][1-8]$/.test(value);
  }
}

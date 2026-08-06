import { Injectable } from '@angular/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { GamePreferences } from '../game/game.types';
import type { ImportPreferences, PersistedGame } from './persistence.types';
import type { AnalysisEngineId, AnalysisSettings } from '../engine/analysis-profiles';

export const LEAL_CHESS_DATABASE_NAME = 'leal-chess';
export const LEAL_CHESS_DATABASE_VERSION = 6;
export const PROFILE_KEYS_INDEX = 'by-profile-key';

/**
 * Record shapes for the feature-owned stores. Core describes the store names, keys, and indexes,
 * which are a persisted compatibility boundary; each feature repository supplies the value types
 * it reads and writes by calling `open<R>()` with its own map.
 */
export interface LealChessStoreRecords {
  coachProfiles: unknown;
  importedGames: unknown;
  gameAnalyses: unknown;
  explorerSessions: unknown;
  reviewAnalysisSessions: unknown;
}

export interface LealChessDatabase<
  R extends LealChessStoreRecords = LealChessStoreRecords,
> extends DBSchema {
  state: {
    key: 'active-game' | 'preferences' | 'import-preferences' | 'analysis-settings';
    value:
      | { key: 'active-game'; value: PersistedGame }
      | { key: 'preferences'; value: GamePreferences }
      | { key: 'import-preferences'; value: ImportPreferences }
      | { key: 'analysis-settings'; value: AnalysisSettings };
  };
  coachProfiles: {
    key: 'chess-com' | 'lichess';
    value: R['coachProfiles'];
  };
  importedGames: {
    key: string;
    value: R['importedGames'];
    indexes: { 'by-profile-key': string };
  };
  gameAnalyses: {
    key: string;
    value: R['gameAnalyses'];
  };
  explorerSessions: {
    key: 'active';
    value: R['explorerSessions'];
  };
  reviewAnalysisSessions: {
    key: string;
    value: R['reviewAnalysisSessions'];
  };
  engineAssets: {
    key: AnalysisEngineId;
    value: {
      id: AnalysisEngineId;
      script: Blob | ArrayBuffer;
      wasm: Blob | ArrayBuffer;
      installedAt: string;
      bytes: number;
    };
  };
}

@Injectable({ providedIn: 'root' })
export class LealChessDatabaseService {
  private database: Promise<IDBPDatabase<LealChessDatabase>> | null = null;

  /** Callers pass their own record map so feature value types stay checked at the repository. */
  open<R extends LealChessStoreRecords = LealChessStoreRecords>(): Promise<
    IDBPDatabase<LealChessDatabase<R>>
  > {
    this.database ??= openDB<LealChessDatabase>(
      LEAL_CHESS_DATABASE_NAME,
      LEAL_CHESS_DATABASE_VERSION,
      {
        upgrade(database) {
          if (!database.objectStoreNames.contains('state')) {
            database.createObjectStore('state', { keyPath: 'key' });
          }
          if (!database.objectStoreNames.contains('coachProfiles')) {
            database.createObjectStore('coachProfiles', { keyPath: 'platform' });
          }
          if (!database.objectStoreNames.contains('importedGames')) {
            const games = database.createObjectStore('importedGames', { keyPath: 'key' });
            games.createIndex(PROFILE_KEYS_INDEX, 'profileKeys', { multiEntry: true });
          }
          if (!database.objectStoreNames.contains('gameAnalyses')) {
            database.createObjectStore('gameAnalyses', { keyPath: 'importedGameKey' });
          }
          if (!database.objectStoreNames.contains('explorerSessions')) {
            database.createObjectStore('explorerSessions', { keyPath: 'id' });
          }
          if (!database.objectStoreNames.contains('reviewAnalysisSessions')) {
            database.createObjectStore('reviewAnalysisSessions', { keyPath: 'importedGameKey' });
          }
          if (!database.objectStoreNames.contains('engineAssets')) {
            database.createObjectStore('engineAssets', { keyPath: 'id' });
          }
        },
      },
    );
    return this.database as unknown as Promise<IDBPDatabase<LealChessDatabase<R>>>;
  }
}

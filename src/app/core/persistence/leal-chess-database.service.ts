import { Injectable } from '@angular/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  GameAnalysis,
  ImportedGame,
  ImportedProfile,
} from '../../features/coach/domain/coach.types';
import type { GamePreferences } from '../game/game.types';
import type { ImportPreferences, PersistedGame } from './persistence.types';
import type { ExplorerSession } from '../../features/explorer/explorer.types';
import type { ReviewAnalysisSession } from '../../features/coach/review-page/review-analysis-session.types';
import type { AnalysisEngineId, AnalysisSettings } from '../engine/analysis-profiles';

export const LEAL_CHESS_DATABASE_NAME = 'leal-chess';
export const LEAL_CHESS_DATABASE_VERSION = 6;
export const PROFILE_KEYS_INDEX = 'by-profile-key';

export interface LealChessDatabase extends DBSchema {
  state: {
    key: 'active-game' | 'preferences' | 'import-preferences' | 'analysis-settings';
    value:
      | { key: 'active-game'; value: PersistedGame }
      | { key: 'preferences'; value: GamePreferences }
      | { key: 'import-preferences'; value: ImportPreferences }
      | { key: 'analysis-settings'; value: AnalysisSettings };
  };
  coachProfiles: {
    key: ImportedProfile['platform'];
    value: ImportedProfile;
  };
  importedGames: {
    key: string;
    value: ImportedGame;
    indexes: { 'by-profile-key': string };
  };
  gameAnalyses: {
    key: string;
    value: GameAnalysis;
  };
  explorerSessions: {
    key: ExplorerSession['id'];
    value: ExplorerSession;
  };
  reviewAnalysisSessions: {
    key: ReviewAnalysisSession['importedGameKey'];
    value: ReviewAnalysisSession;
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

  open(): Promise<IDBPDatabase<LealChessDatabase>> {
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
    return this.database;
  }
}

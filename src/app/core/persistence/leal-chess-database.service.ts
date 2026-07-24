import { Injectable } from '@angular/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ImportedGame, ImportedProfile } from '../../features/coach/domain/coach.types';
import type { GamePreferences } from '../game/game.types';
import type { PersistedGame } from './persistence.types';

export const LEAL_CHESS_DATABASE_NAME = 'leal-chess';
export const LEAL_CHESS_DATABASE_VERSION = 2;
export const PROFILE_KEYS_INDEX = 'by-profile-key';

export interface LealChessDatabase extends DBSchema {
  state: {
    key: 'active-game' | 'preferences';
    value:
      { key: 'active-game'; value: PersistedGame } | { key: 'preferences'; value: GamePreferences };
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
        },
      },
    );
    return this.database;
  }
}

import { Injectable, inject } from '@angular/core';
import { clearOnboardingCompletion } from '../onboarding/onboarding.service';
import {
  DEFAULT_IMPORT_PREFERENCES,
  SPEED_FILTERS,
  type ImportPreferences,
  type SpeedFilter,
} from './persistence.types';
import { LealChessDatabaseService } from './leal-chess-database.service';

/**
 * The part of an imported platform profile that seeding import preferences needs. Feature profile
 * types satisfy this structurally, so core does not depend on the coach domain.
 */
export interface ImportProfileHint {
  readonly platform: 'chess-com' | 'lichess';
  readonly username: string;
}

export interface LealChessStorageUsage {
  readonly records: number;
  readonly puzzles: number;
  readonly engines: number;
  readonly total: number;
}

@Injectable({ providedIn: 'root' })
export class SettingsPersistenceService {
  private readonly database = inject(LealChessDatabaseService);

  async calculateStorageUsage(): Promise<LealChessStorageUsage | null> {
    try {
      const database = await this.database.open();
      const recordsByStore = await Promise.all([
        database.getAll('state'),
        database.getAll('coachProfiles'),
        database.getAll('importedGames'),
        database.getAll('gameAnalyses'),
        database.getAll('explorerSessions'),
        database.getAll('reviewAnalysisSessions'),
      ]);
      const puzzleRecords = await Promise.all([
        database.getAll('puzzleDaily'),
        database.getAll('puzzleAttempts'),
      ]);
      const engineAssets = await database.getAll('engineAssets');
      const encoder = new TextEncoder();
      const records = recordsByStore
        .flat()
        .reduce<number>(
          (total, record) => total + encoder.encode(JSON.stringify(record)).byteLength,
          0,
        );
      const puzzles = puzzleRecords
        .flat()
        .reduce<number>((total, record) => total + encodedSize(record, encoder), 0);
      const engines = engineAssets.reduce((total, asset) => total + asset.bytes, 0);
      return { records, puzzles, engines, total: records + puzzles + engines };
    } catch {
      return null;
    }
  }

  async importPreferences(profiles: readonly ImportProfileHint[]): Promise<ImportPreferences> {
    const database = await this.database.open();
    const record = await database.get('state', 'import-preferences');
    if (record?.key === 'import-preferences') {
      return normalizeImportPreferences(record.value);
    }
    const preferences = {
      ...DEFAULT_IMPORT_PREFERENCES,
      chessComUsername:
        profiles.find((profile) => profile.platform === 'chess-com')?.username ?? '',
      lichessUsername: profiles.find((profile) => profile.platform === 'lichess')?.username ?? '',
    };
    await this.saveImportPreferences(preferences);
    return preferences;
  }

  async saveImportPreferences(preferences: ImportPreferences): Promise<void> {
    await (
      await this.database.open()
    ).put('state', {
      key: 'import-preferences',
      value: normalizeImportPreferences(preferences),
    });
  }

  async clearAll(): Promise<void> {
    const database = await this.database.open();
    const stores = [
      'state',
      'coachProfiles',
      'importedGames',
      'gameAnalyses',
      'explorerSessions',
      'reviewAnalysisSessions',
      'engineAssets',
      'puzzleDaily',
      'puzzleAttempts',
    ] as const;
    const transaction = database.transaction(stores, 'readwrite');
    await Promise.all(stores.map((store) => transaction.objectStore(store).clear()));
    await transaction.done;
    localStorage.removeItem('lealchess.stockfish.downloads');
    clearOnboardingCompletion();
  }
}

function encodedSize(value: unknown, encoder: TextEncoder): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

export function normalizeImportPreferences(value: unknown): ImportPreferences {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const maxGames = Number(record['maxGames']);
  return {
    chessComUsername:
      typeof record['chessComUsername'] === 'string' ? record['chessComUsername'] : '',
    lichessUsername: typeof record['lichessUsername'] === 'string' ? record['lichessUsername'] : '',
    maxGames:
      Number.isInteger(maxGames) && maxGames >= 1 && maxGames <= 100
        ? maxGames
        : DEFAULT_IMPORT_PREFERENCES.maxGames,
    speed: SPEED_FILTERS.includes(record['speed'] as SpeedFilter)
      ? (record['speed'] as SpeedFilter)
      : DEFAULT_IMPORT_PREFERENCES.speed,
  };
}

import { Injectable, inject } from '@angular/core';
import type { ImportedProfile } from '../../features/coach/domain/coach.types';
import { DEFAULT_IMPORT_PREFERENCES, type ImportPreferences } from './persistence.types';
import { LealChessDatabaseService } from './leal-chess-database.service';

@Injectable({ providedIn: 'root' })
export class SettingsPersistenceService {
  private readonly database = inject(LealChessDatabaseService);

  async importPreferences(profiles: readonly ImportedProfile[]): Promise<ImportPreferences> {
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
    const stores = ['state', 'coachProfiles', 'importedGames', 'gameAnalyses'] as const;
    const transaction = database.transaction(stores, 'readwrite');
    await Promise.all(stores.map((store) => transaction.objectStore(store).clear()));
    await transaction.done;
  }
}

export function normalizeImportPreferences(value: unknown): ImportPreferences {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const speeds = ['any', 'bullet', 'blitz', 'rapid', 'classical-daily'];
  const maxGames = Number(record['maxGames']);
  return {
    chessComUsername:
      typeof record['chessComUsername'] === 'string' ? record['chessComUsername'] : '',
    lichessUsername: typeof record['lichessUsername'] === 'string' ? record['lichessUsername'] : '',
    maxGames:
      Number.isInteger(maxGames) && maxGames >= 1 && maxGames <= 100
        ? maxGames
        : DEFAULT_IMPORT_PREFERENCES.maxGames,
    speed: speeds.includes(String(record['speed']))
      ? (record['speed'] as ImportPreferences['speed'])
      : DEFAULT_IMPORT_PREFERENCES.speed,
  };
}

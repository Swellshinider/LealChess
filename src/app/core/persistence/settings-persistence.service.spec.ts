import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { LealChessDatabaseService } from './leal-chess-database.service';
import { SettingsPersistenceService } from './settings-persistence.service';

describe('SettingsPersistenceService', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    });
    TestBed.configureTestingModule({});
  });

  it('seeds usernames from profiles and persists import filters', async () => {
    const service = TestBed.inject(SettingsPersistenceService);
    const seeded = await service.importPreferences([
      {
        platform: 'lichess',
        username: 'leal-player',
        displayName: 'Leal Player',
        profileUrl: 'https://lichess.org/@/leal-player',
        updatedAt: '2026-07-27T12:00:00.000Z',
      },
    ]);
    expect(seeded.lichessUsername).toBe('leal-player');

    await service.saveImportPreferences({ ...seeded, maxGames: 42, speed: 'rapid' });
    await expect(service.importPreferences([])).resolves.toMatchObject({
      lichessUsername: 'leal-player',
      maxGames: 42,
      speed: 'rapid',
    });
  });

  it('clears every application store in one operation', async () => {
    const database = await TestBed.inject(LealChessDatabaseService).open();
    await database.put('coachProfiles', {
      platform: 'lichess',
      username: 'player',
      displayName: 'Player',
      profileUrl: 'https://lichess.org/@/player',
      updatedAt: '2026-07-27T12:00:00.000Z',
    });
    await database.put('state', {
      key: 'import-preferences',
      value: { chessComUsername: '', lichessUsername: 'player', maxGames: 20, speed: 'any' },
    });

    await TestBed.inject(SettingsPersistenceService).clearAll();

    await expect(database.getAll('state')).resolves.toEqual([]);
    await expect(database.getAll('coachProfiles')).resolves.toEqual([]);
    await expect(database.getAll('importedGames')).resolves.toEqual([]);
    await expect(database.getAll('gameAnalyses')).resolves.toEqual([]);
  });
});

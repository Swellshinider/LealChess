import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { ONBOARDING_COMPLETION_KEY } from '../onboarding/onboarding.service';
import { LealChessDatabaseService } from './leal-chess-database.service';
import { SettingsPersistenceService } from './settings-persistence.service';

describe('SettingsPersistenceService', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    });
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('calculates saved record bytes together with downloaded engine bytes', async () => {
    const database = await TestBed.inject(LealChessDatabaseService).open();
    const profile = {
      platform: 'lichess' as const,
      username: 'player',
      displayName: 'Player',
      profileUrl: 'https://lichess.org/@/player',
      updatedAt: '2026-07-27T12:00:00.000Z',
    };
    const preferences = {
      key: 'import-preferences' as const,
      value: {
        chessComUsername: '',
        lichessUsername: 'player',
        maxGames: 20,
        speed: 'any' as const,
      },
    };
    await database.put('coachProfiles', profile);
    await database.put('state', preferences);
    await database.put('engineAssets', {
      id: 'stockfish-18-lite',
      script: new Blob(),
      wasm: new Blob(),
      installedAt: '2026-08-02T12:00:00.000Z',
      bytes: 7_316_840,
    });

    const records =
      new TextEncoder().encode(JSON.stringify(profile)).byteLength +
      new TextEncoder().encode(JSON.stringify(preferences)).byteLength;
    await expect(
      TestBed.inject(SettingsPersistenceService).calculateStorageUsage(),
    ).resolves.toEqual({
      records,
      puzzles: 0,
      engines: 7_316_840,
      total: records + 7_316_840,
    });
  });

  it('includes fetched daily puzzles and attempts in local storage usage', async () => {
    const database = await TestBed.inject(LealChessDatabaseService).open();
    const daily = { provider: 'lichess', id: 'lichess', puzzle: { key: 'daily' } };
    const attempt = { id: 'attempt-1', outcome: 'clean-solved' };
    await database.put('puzzleDaily', daily);
    await database.put('puzzleAttempts', attempt);

    const puzzles =
      new TextEncoder().encode(JSON.stringify(daily)).byteLength +
      new TextEncoder().encode(JSON.stringify(attempt)).byteLength;
    await expect(
      TestBed.inject(SettingsPersistenceService).calculateStorageUsage(),
    ).resolves.toEqual({ records: 0, puzzles, engines: 0, total: puzzles });
  });

  it('seeds usernames from profiles and persists import filters', async () => {
    const service = TestBed.inject(SettingsPersistenceService);
    const seeded = await service.importPreferences([
      { platform: 'lichess', username: 'leal-player' },
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
    await database.put('engineAssets', {
      id: 'stockfish-18-full',
      script: new Blob(),
      wasm: new Blob(),
      installedAt: '2026-08-02T12:00:00.000Z',
      bytes: 113_013_789,
    });
    await database.put('puzzleDaily', { provider: 'lichess', id: 'lichess' });
    await database.put('puzzleAttempts', { id: 'attempt-1', outcome: 'clean-solved' });
    localStorage.setItem(ONBOARDING_COMPLETION_KEY, '1');

    await TestBed.inject(SettingsPersistenceService).clearAll();

    await expect(database.getAll('state')).resolves.toEqual([]);
    await expect(database.getAll('coachProfiles')).resolves.toEqual([]);
    await expect(database.getAll('importedGames')).resolves.toEqual([]);
    await expect(database.getAll('gameAnalyses')).resolves.toEqual([]);
    await expect(database.getAll('explorerSessions')).resolves.toEqual([]);
    await expect(database.getAll('reviewAnalysisSessions')).resolves.toEqual([]);
    await expect(database.getAll('engineAssets')).resolves.toEqual([]);
    await expect(database.getAll('puzzleDaily')).resolves.toEqual([]);
    await expect(database.getAll('puzzleAttempts')).resolves.toEqual([]);
    await expect(
      TestBed.inject(SettingsPersistenceService).calculateStorageUsage(),
    ).resolves.toEqual({
      records: 0,
      puzzles: 0,
      engines: 0,
      total: 0,
    });
    expect(localStorage.getItem(ONBOARDING_COMPLETION_KEY)).toBeNull();
  });
});

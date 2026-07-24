import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ImportedGame, ImportedProfile } from '../domain/coach.types';
import { CoachRepositoryService } from './coach-repository.service';

const profile: ImportedProfile = {
  platform: 'lichess',
  username: 'Learner',
  displayName: 'Learner',
  profileUrl: 'https://lichess.org/@/Learner',
  updatedAt: '2026-07-24T12:00:00.000Z',
};

describe('CoachRepositoryService', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    });
    TestBed.configureTestingModule({ providers: [CoachRepositoryService] });
  });

  it('migrates a version-1 database without losing the bot state store', async () => {
    const versionOne = await openVersionOne();
    versionOne.close();
    const repository = TestBed.inject(CoachRepositoryService);
    await repository.saveSuccessfulImport(profile, [game()]);

    const database = await openNative();
    expect(database.objectStoreNames.contains('state')).toBe(true);
    expect(database.objectStoreNames.contains('coachProfiles')).toBe(true);
    expect(database.objectStoreNames.contains('importedGames')).toBe(true);
    database.close();
  });

  it('deduplicates imports, preserves first import, and unions profile associations', async () => {
    const repository = TestBed.inject(CoachRepositoryService);
    await repository.saveSuccessfulImport(profile, [game()]);
    const changed = {
      ...game(),
      speed: 'blitz',
      firstImportedAt: 'later',
      lastImportedAt: '2026-07-24T13:00:00.000Z',
      profileKeys: ['lichess:learner', 'lichess:second'],
    };
    await repository.saveSuccessfulImport(profile, [changed]);
    const stored = await repository.game('lichess', 'game-1');
    expect(stored).toMatchObject({
      speed: 'blitz',
      firstImportedAt: '2026-07-24T12:00:00.000Z',
      lastImportedAt: '2026-07-24T13:00:00.000Z',
    });
    expect(stored?.profileKeys).toEqual(['lichess:learner', 'lichess:second']);
  });

  it('loads only games associated with the active profile', async () => {
    const repository = TestBed.inject(CoachRepositoryService);
    await repository.saveSuccessfulImport(profile, [
      game(),
      {
        ...game(),
        key: 'lichess:hidden',
        platformGameId: 'hidden',
        profileKeys: ['lichess:other'],
      },
    ]);
    expect((await repository.gamesForActiveProfiles()).map((item) => item.key)).toEqual([
      'lichess:game-1',
    ]);
  });
});

function game(): ImportedGame {
  return {
    key: 'lichess:game-1',
    platform: 'lichess',
    platformGameId: 'game-1',
    platformUrl: '',
    pgn: '',
    variant: 'standard',
    white: { username: 'Learner' },
    black: { username: 'Opponent' },
    result: '1-0',
    speed: 'rapid',
    timeControl: '600',
    rated: true,
    endTime: '2026-07-24T12:00:00.000Z',
    moves: [],
    parseStatus: 'ready',
    profileKeys: ['lichess:learner'],
    firstImportedAt: '2026-07-24T12:00:00.000Z',
    lastImportedAt: '2026-07-24T12:00:00.000Z',
  };
}

function openVersionOne(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('leal-chess', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openNative(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('leal-chess');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

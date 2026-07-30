import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { LealChessDatabaseService } from '../../../core/persistence/leal-chess-database.service';
import { PERSISTENCE_SCHEMA_VERSION } from '../../../core/persistence/persistence.types';
import type { GameAnalysis, ImportedGame, ImportedProfile } from '../domain/coach.types';
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
    expect(database.objectStoreNames.contains('gameAnalyses')).toBe(true);
    database.close();
  });

  it('adds the analysis cache to a version-2 coach database without losing games', async () => {
    const versionTwo = await openVersionTwo();
    versionTwo.close();
    const repository = TestBed.inject(CoachRepositoryService);

    expect(await repository.game('lichess', 'game-1')).toMatchObject({ key: 'lichess:game-1' });
    const database = await openNative();
    expect(database.objectStoreNames.contains('gameAnalyses')).toBe(true);
    database.close();
  });

  it('deduplicates imports, preserves first import, and unions profile associations', async () => {
    const repository = TestBed.inject(CoachRepositoryService);
    await expect(repository.saveSuccessfulImport(profile, [game()])).resolves.toEqual({
      addedCount: 1,
      duplicateCount: 0,
    });
    const changed = {
      ...game(),
      speed: 'blitz',
      firstImportedAt: 'later',
      lastImportedAt: '2026-07-24T13:00:00.000Z',
      profileKeys: ['lichess:learner', 'lichess:second'],
    };
    await expect(repository.saveSuccessfulImport(profile, [changed])).resolves.toEqual({
      addedCount: 0,
      duplicateCount: 1,
    });
    const stored = await repository.game('lichess', 'game-1');
    expect(stored).toMatchObject({
      speed: 'blitz',
      firstImportedAt: '2026-07-24T12:00:00.000Z',
      lastImportedAt: '2026-07-24T13:00:00.000Z',
    });
    expect(stored?.profileKeys).toEqual(['lichess:learner', 'lichess:second']);
  });

  it('saves a detected opening once and preserves it across imports without metadata', async () => {
    const repository = TestBed.inject(CoachRepositoryService);
    await repository.saveSuccessfulImport(profile, [game()]);
    await repository.saveOpeningIfMissing('lichess:game-1', {
      eco: 'C70',
      name: 'Ruy Lopez: Morphy Defense',
    });
    await repository.saveOpeningIfMissing('lichess:game-1', {
      eco: 'C20',
      name: "King's Pawn Game",
    });
    await repository.saveSuccessfulImport(profile, [{ ...game(), speed: 'blitz' }]);

    expect(await repository.game('lichess', 'game-1')).toMatchObject({
      speed: 'blitz',
      opening: { eco: 'C70', name: 'Ruy Lopez: Morphy Defense' },
    });
  });

  it('lets later provider metadata replace a detected opening', async () => {
    const repository = TestBed.inject(CoachRepositoryService);
    await repository.saveSuccessfulImport(profile, [game()]);
    await repository.saveOpeningIfMissing('lichess:game-1', {
      eco: 'C70',
      name: 'Ruy Lopez: Morphy Defense',
    });
    await repository.saveSuccessfulImport(profile, [
      { ...game(), opening: { eco: 'C60', name: 'Ruy Lopez' } },
    ]);

    expect((await repository.game('lichess', 'game-1'))?.opening).toEqual({
      eco: 'C60',
      name: 'Ruy Lopez',
    });
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

  it('loads local games without requiring an imported profile', async () => {
    const repository = TestBed.inject(CoachRepositoryService);
    await repository.saveLocalGame(localGame());

    expect((await repository.gamesForActiveProfiles()).map((item) => item.key)).toEqual([
      'local:local-game',
    ]);
  });

  it('preserves a detected opening when a local game is saved again', async () => {
    const repository = TestBed.inject(CoachRepositoryService);
    const local = localGame();
    await repository.saveLocalGame(local);
    await repository.saveOpeningIfMissing(local.key, {
      eco: 'C70',
      name: 'Ruy Lopez: Morphy Defense',
    });
    await repository.saveLocalGame({ ...local, lastImportedAt: '2026-07-24T13:00:00.000Z' });

    expect((await repository.game('local', local.platformGameId))?.opening).toEqual({
      eco: 'C70',
      name: 'Ruy Lopez: Morphy Defense',
    });
  });

  it('deletes a game, its analysis, and the matching completed local game state', async () => {
    const repository = TestBed.inject(CoachRepositoryService);
    const database = await TestBed.inject(LealChessDatabaseService).open();
    const local = localGame();
    await repository.saveLocalGame(local);
    await repository.saveAnalysis(analysis(local.key));
    await database.put('state', {
      key: 'active-game',
      value: {
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        gameId: local.platformGameId,
        pgn: '',
        fen: '',
        moves: [],
        playerColor: 'white',
        orientation: 'white',
        botRating: 1500,
        pendingPremove: null,
        result: { winner: 'white', reason: 'checkmate', label: 'White wins' },
        updatedAt: '2026-07-28T12:00:00.000Z',
      },
    });

    await repository.deleteGame(local);

    await expect(repository.game('local', local.platformGameId)).resolves.toBeUndefined();
    await expect(repository.analysis(local.key)).resolves.toBeUndefined();
    await expect(database.get('state', 'active-game')).resolves.toBeUndefined();
  });

  it('keeps active play state when deleting an imported game', async () => {
    const repository = TestBed.inject(CoachRepositoryService);
    const database = await TestBed.inject(LealChessDatabaseService).open();
    const imported = game();
    await repository.saveSuccessfulImport(profile, [imported]);
    await database.put('state', {
      key: 'active-game',
      value: {
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        gameId: 'active-local-game',
        pgn: '',
        fen: '',
        moves: [],
        playerColor: 'white',
        orientation: 'white',
        botRating: 1500,
        pendingPremove: null,
        result: null,
        updatedAt: '2026-07-28T12:00:00.000Z',
      },
    });

    await repository.deleteGame(imported);

    await expect(database.get('state', 'active-game')).resolves.toBeDefined();
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

function localGame(): ImportedGame {
  return {
    ...game(),
    key: 'local:local-game',
    platform: 'local',
    platformGameId: 'local-game',
    white: { username: 'You' },
    black: { username: 'Stockfish' },
    rated: false,
    profileKeys: [],
    learnerColor: 'white',
  };
}

function analysis(gameKey: string): GameAnalysis {
  return {
    importedGameKey: gameKey,
    schemaVersion: 1,
    sourceFingerprint: 'fingerprint',
    engineVersion: 'test',
    depth: 1,
    learnerColor: 'white',
    status: 'complete',
    totalUserMoves: 0,
    moves: [],
    updatedAt: '2026-07-28T12:00:00.000Z',
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

function openVersionTwo(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('leal-chess', 2);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('state', { keyPath: 'key' });
      request.result.createObjectStore('coachProfiles', { keyPath: 'platform' });
      const games = request.result.createObjectStore('importedGames', { keyPath: 'key' });
      games.createIndex('by-profile-key', 'profileKeys', { multiEntry: true });
      games.put(game());
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

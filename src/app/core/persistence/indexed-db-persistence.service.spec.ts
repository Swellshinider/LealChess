import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '../game/game.types';
import { IndexedDbPersistenceService } from './indexed-db-persistence.service';
import { PERSISTENCE_SCHEMA_VERSION, type PersistedGame } from './persistence.types';

const game: PersistedGame = {
  schemaVersion: PERSISTENCE_SCHEMA_VERSION,
  gameId: 'game-1',
  pgn: '',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: [],
  playerColor: 'white',
  orientation: 'white',
  difficulty: 'casual',
  pendingPremove: null,
  result: null,
  updatedAt: '2026-07-23T12:00:00.000Z',
};

describe('IndexedDbPersistenceService', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    });
  });

  it('round-trips the active game and preferences', async () => {
    const repository = new IndexedDbPersistenceService();
    const preferences = { ...DEFAULT_PREFERENCES, soundEnabled: false as const };
    await repository.saveGame(game);
    await repository.savePreferences(preferences);
    await repository.flush();

    await expect(repository.restore()).resolves.toEqual({ game, preferences });
  });

  it('falls back safely for corrupted records', async () => {
    const repository = new IndexedDbPersistenceService();
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('leal-chess', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('state', 'readwrite');
    transaction.objectStore('state').put({ key: 'active-game', value: { schemaVersion: 999 } });
    await new Promise<void>((resolve) => {
      transaction.oncomplete = () => resolve();
    });
    database.close();

    const restored = await repository.restore();
    expect(restored.game).toBeNull();
    expect(restored.preferences).toEqual(DEFAULT_PREFERENCES);
  });
});

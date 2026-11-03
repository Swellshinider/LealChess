import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { PuzzleRepositoryService, puzzleStats } from './puzzle-repository.service';
import type { PuzzleAttempt } from './puzzle.types';

describe('PuzzleRepositoryService', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    });
    TestBed.configureTestingModule({});
  });

  it('restores cached daily puzzles', async () => {
    const repository = TestBed.inject(PuzzleRepositoryService);
    await repository.cacheDaily({
      id: 'lichess',
      provider: 'lichess',
      fetchedDate: '2026-08-12',
      fetchedAt: '2026-08-12T12:00:00Z',
      puzzle: {
        source: 'lichess',
        key: 'daily',
        fen: '',
        solution: [],
        externalUrl: '',
        themes: [],
        openings: [],
      },
    });
    await expect(repository.cachedDaily('lichess')).resolves.toMatchObject({
      fetchedDate: '2026-08-12',
    });
    await expect(repository.cachedDaily('chess-com')).resolves.toBeNull();
  });

  it('retains 500 attempts while preserving a sole old daily credit', async () => {
    const repository = TestBed.inject(PuzzleRepositoryService);
    await repository.recordAttempt(attempt('credit', '2025-01-01T00:00:00Z', true, '2025-01-01'));
    for (let index = 0; index < 501; index += 1) {
      await repository.recordAttempt(
        attempt(`practice-${index}`, new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()),
      );
    }
    const attempts = await repository.attempts();
    expect(attempts).toHaveLength(500);
    expect(attempts.some((item) => item.id === 'credit')).toBe(true);
    expect(attempts.some((item) => item.id === 'practice-0')).toBe(false);
  });
});

describe('puzzleStats', () => {
  it('calculates unique local-calendar streak dates and clean rate', () => {
    const attempts = [
      attempt('a', '2026-08-10T12:00:00Z', true, '2026-08-10'),
      attempt('b', '2026-08-11T12:00:00Z', true, '2026-08-11'),
      attempt('c', '2026-08-11T13:00:00Z', true, '2026-08-11'),
      { ...attempt('d', '2026-08-12T12:00:00Z'), outcome: 'assisted' as const },
    ];
    expect(puzzleStats(attempts, '2026-08-12')).toEqual({
      total: 4,
      clean: 3,
      cleanRate: 75,
      currentStreak: 2,
      longestStreak: 2,
    });
  });
});

function attempt(
  id: string,
  completedAt: string,
  dailyCredit = false,
  dailyDate?: string,
): PuzzleAttempt {
  return {
    id,
    puzzleKey: id,
    source: 'lichess-catalog',
    outcome: 'clean-solved',
    mistakes: 0,
    hintLevel: 0,
    themes: [],
    openings: [],
    startedAt: completedAt,
    completedAt,
    dailyCredit,
    dailyDate,
  };
}

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { Chess } from 'chess.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSISTENCE_PORT } from '../../../core/persistence/persistence.types';
import { SoundService } from '../../../core/sound/sound.service';
import { CoachAnalysisService } from '../analysis/coach-analysis.service';
import { CoachRepositoryService } from '../data/coach-repository.service';
import type { ImportedGame } from '../domain/coach.types';
import { PracticeAnalysisService } from './practice-analysis.service';
import { ReviewPageStore } from './review-page.store';

describe('ReviewPageStore', () => {
  const repository = {
    game: vi.fn(),
    profiles: vi.fn(),
    saveOpeningIfMissing: vi.fn(),
  };
  const coachAnalysis = {
    analysis: signal(null),
    state: signal({ phase: 'idle' }),
    load: vi.fn(),
    cancel: vi.fn(),
  };
  let routeValues: Record<string, string | null>;

  beforeEach(() => {
    vi.clearAllMocks();
    routeValues = {};
    TestBed.configureTestingModule({
      providers: [
        ReviewPageStore,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: (key: string) => routeValues[key] ?? null } } },
        },
        {
          provide: CoachRepositoryService,
          useValue: repository,
        },
        {
          provide: PERSISTENCE_PORT,
          useValue: {
            restore: vi.fn().mockResolvedValue({
              game: null,
              preferences: {
                soundEnabled: false,
                showLegalMoves: true,
                premovesEnabled: true,
                boardTheme: 'blue-steel',
                orientation: 'white',
                botRating: 1500,
              },
            }),
          },
        },
        { provide: SoundService, useValue: { setEnabled: vi.fn() } },
        {
          provide: PracticeAnalysisService,
          useValue: { state: signal({ phase: 'idle' }), destroy: vi.fn() },
        },
        {
          provide: CoachAnalysisService,
          useValue: coachAnalysis,
        },
      ],
    });
  });

  it('restores presentation preferences and completes an empty route load', async () => {
    const store = TestBed.inject(ReviewPageStore);
    await store.initialize();
    expect(store.loading()).toBe(false);
    expect(store.game()).toBeNull();
    expect(store.boardTheme()).toBe('blue-steel');
  });

  it('detects and persists a missing opening when the review loads', async () => {
    routeValues = { platform: 'chess-com', gameId: 'review-game' };
    repository.game.mockResolvedValue(reviewGame());
    repository.profiles.mockResolvedValue([
      {
        platform: 'chess-com',
        username: 'Learner',
        displayName: 'Learner',
        profileUrl: '',
        updatedAt: '2026-07-30T12:00:00.000Z',
      },
    ]);
    repository.saveOpeningIfMissing.mockResolvedValue(undefined);

    const store = TestBed.inject(ReviewPageStore);
    await store.initialize();

    expect(store.game()?.opening).toEqual({
      eco: 'C70',
      name: 'Ruy Lopez: Morphy Defense',
    });
    expect(repository.saveOpeningIfMissing).toHaveBeenCalledWith('chess-com:review-game', {
      eco: 'C70',
      name: 'Ruy Lopez: Morphy Defense',
    });
    expect(coachAnalysis.load).toHaveBeenCalledWith(
      expect.objectContaining({
        opening: { eco: 'C70', name: 'Ruy Lopez: Morphy Defense' },
      }),
      'white',
    );
  });

  it('keeps provider opening metadata without trying to replace it', async () => {
    routeValues = { platform: 'chess-com', gameId: 'review-game' };
    const game = {
      ...reviewGame(),
      opening: { eco: 'C60', name: 'Provider opening' },
    };
    repository.game.mockResolvedValue(game);
    repository.profiles.mockResolvedValue([]);

    const store = TestBed.inject(ReviewPageStore);
    await store.initialize();

    expect(store.game()).toBe(game);
    expect(repository.saveOpeningIfMissing).not.toHaveBeenCalled();
  });
});

function reviewGame(): ImportedGame {
  const chess = new Chess();
  const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'].map((san, index) => {
    const move = chess.move(san);
    return {
      ply: index + 1,
      color: move.color === 'w' ? ('white' as const) : ('black' as const),
      san: move.san,
      from: move.from,
      to: move.to,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      fenBefore: move.before,
      fenAfter: move.after,
    };
  });
  return {
    key: 'chess-com:review-game',
    platform: 'chess-com',
    platformGameId: 'review-game',
    platformUrl: '',
    pgn: '',
    variant: 'standard',
    white: { username: 'Learner' },
    black: { username: 'Opponent' },
    result: '1-0',
    speed: 'rapid',
    timeControl: '600',
    rated: true,
    endTime: '2026-07-30T12:00:00.000Z',
    moves,
    parseStatus: 'ready',
    profileKeys: ['chess-com:learner'],
    firstImportedAt: '2026-07-30T12:00:00.000Z',
    lastImportedAt: '2026-07-30T12:00:00.000Z',
  };
}

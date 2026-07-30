import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSISTENCE_PORT } from '../../../core/persistence/persistence.types';
import { SoundService } from '../../../core/sound/sound.service';
import { CoachAnalysisService } from '../analysis/coach-analysis.service';
import { CoachRepositoryService } from '../data/coach-repository.service';
import { PracticeAnalysisService } from './practice-analysis.service';
import { ReviewPageStore } from './review-page.store';

describe('ReviewPageStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ReviewPageStore,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => null } } },
        },
        {
          provide: CoachRepositoryService,
          useValue: { game: vi.fn(), profiles: vi.fn() },
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
          useValue: {
            analysis: signal(null),
            state: signal({ phase: 'idle' }),
            load: vi.fn(),
            cancel: vi.fn(),
          },
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
});

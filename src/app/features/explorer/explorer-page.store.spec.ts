import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSISTENCE_PORT } from '../../core/persistence/persistence.types';
import { ExplorerPageStore } from './explorer-page.store';
import { ExplorerRepositoryService } from './explorer-repository.service';

describe('ExplorerPageStore', () => {
  const repository = {
    restore: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        ExplorerPageStore,
        { provide: ExplorerRepositoryService, useValue: repository },
        {
          provide: PERSISTENCE_PORT,
          useValue: {
            restore: vi.fn().mockResolvedValue({
              game: null,
              preferences: {
                soundEnabled: true,
                showLegalMoves: true,
                premovesEnabled: true,
                boardTheme: 'rosewood',
                orientation: 'white',
                difficulty: 'casual',
              },
            }),
          },
        },
      ],
    });
  });

  it('restores the workspace before exposing it to the route shell', async () => {
    const store = TestBed.inject(ExplorerPageStore);
    await store.initialize();
    expect(store.loading()).toBe(false);
    expect(store.boardTheme()).toBe('rosewood');
    expect(store.session().selectedNodeId).toBe('root');
    await store.destroy();
    expect(repository.save).toHaveBeenCalled();
    expect(repository.flush).toHaveBeenCalled();
  });
});

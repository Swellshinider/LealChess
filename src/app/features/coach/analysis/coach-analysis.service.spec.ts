import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANALYSIS_ENGINE_PORT,
  type AnalysisEnginePort,
  type PositionAnalysisRequest,
  type PositionAnalysisResult,
} from '../../../core/engine/analysis-engine.types';
import { parseImportedPgn } from '../parsing/pgn-parser';
import type { ImportedGame } from '../domain/coach.types';
import { CoachRepositoryService } from '../data/coach-repository.service';
import { CoachAnalysisService } from './coach-analysis.service';

class FakeAnalysisEngine implements AnalysisEnginePort {
  readonly requests: PositionAnalysisRequest[] = [];
  matchFirst = false;
  blockSecondLearnerMove = false;
  private resumed = false;

  analyze(request: PositionAnalysisRequest): Promise<PositionAnalysisResult> {
    this.requests.push(request);
    if (this.blockSecondLearnerMove && this.requests.length === 2 && !this.resumed) {
      return new Promise((_, reject) => {
        request.signal?.addEventListener(
          'abort',
          () => {
            this.resumed = true;
            reject(new DOMException('Cancelled', 'AbortError'));
          },
          { once: true },
        );
      });
    }
    const played = request.searchMove;
    return Promise.resolve({
      bestMove:
        played === 'e2e3'
          ? { from: 'e2', to: 'e3' }
          : this.requests.length === 1
            ? { from: 'e2', to: this.matchFirst ? 'e3' : 'e4' }
            : { from: 'g1', to: 'f3' },
      evaluation: {
        score: { kind: 'centipawn', value: played ? -100 : 30 },
        depth: 14,
      },
      principalVariation: [played ?? (this.requests.length === 1 ? 'e2e4' : 'g1f3')],
    });
  }

  destroy(): void {}
}

describe('CoachAnalysisService', () => {
  let engine: FakeAnalysisEngine;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    });
    engine = new FakeAnalysisEngine();
    TestBed.configureTestingModule({
      providers: [{ provide: ANALYSIS_ENGINE_PORT, useValue: engine }],
    });
  });

  it('analyzes only learner moves and reuses the best evaluation for a matching move', async () => {
    const service = TestBed.inject(CoachAnalysisService);
    const game = importedGame();
    await service.load(game, 'white');
    await service.analyze(game, 'white');

    expect(engine.requests.map((request) => request.searchMove ?? 'best')).toEqual([
      'best',
      'e2e3',
      'best',
    ]);
    expect(service.analysis()).toMatchObject({
      status: 'complete',
      totalUserMoves: 2,
      moves: [
        { ply: 1, classification: 'mistake', category: 'opening' },
        { ply: 3, classification: 'good', centipawnLoss: 0 },
      ],
    });
    await expect(TestBed.inject(CoachRepositoryService).analysis(game.key)).resolves.toMatchObject({
      status: 'complete',
    });
  });

  it('persists partial work on cancel and resumes at the next learner move', async () => {
    engine.matchFirst = true;
    engine.blockSecondLearnerMove = true;
    const service = TestBed.inject(CoachAnalysisService);
    const game = importedGame();
    await service.load(game, 'white');

    const cancelledRun = service.analyze(game, 'white');
    await waitFor(() => engine.requests.length === 2);
    service.cancel();
    await cancelledRun;

    expect(service.state()).toMatchObject({ phase: 'partial', completed: 1, total: 2 });
    await expect(TestBed.inject(CoachRepositoryService).analysis(game.key)).resolves.toMatchObject({
      status: 'partial',
      moves: [{ ply: 1 }],
    });

    await service.analyze(game, 'white');
    expect(service.state()).toMatchObject({ phase: 'complete', completed: 2, total: 2 });
    expect(engine.requests).toHaveLength(3);
  });
});

function importedGame(): ImportedGame {
  const parsed = parseImportedPgn(
    `[White "Learner"]
[Black "Opponent"]
[Result "*"]

1. e3 e5 2. Nf3 *`,
  );
  return {
    key: 'lichess:analysis-game',
    platform: 'lichess',
    platformGameId: 'analysis-game',
    platformUrl: '',
    pgn: '',
    variant: 'standard',
    white: { username: 'Learner' },
    black: { username: 'Opponent' },
    result: '*',
    speed: 'rapid',
    timeControl: '600',
    rated: false,
    endTime: '2026-07-24T12:00:00.000Z',
    moves: parsed.moves,
    parseStatus: 'ready',
    profileKeys: ['lichess:learner'],
    firstImportedAt: '2026-07-24T12:00:00.000Z',
    lastImportedAt: '2026-07-24T12:00:00.000Z',
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  while (!predicate()) await new Promise((resolve) => setTimeout(resolve, 0));
}

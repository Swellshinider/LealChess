import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { Chess, type Square } from 'chess.js';
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
  initialization: Promise<void> = Promise.resolve();
  initializationError: Error | null = null;
  private resumed = false;

  initialize(): Promise<void> {
    return this.initializationError
      ? Promise.reject(this.initializationError)
      : this.initialization;
  }

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
    const bestMove = played ?? this.bestMove(request.fen);
    return Promise.resolve({
      bestMove: {
        from: bestMove.slice(0, 2) as Square,
        to: bestMove.slice(2, 4) as Square,
      },
      evaluation: {
        score: { kind: 'centipawn', value: played ? -100 : 30 },
        depth: 16,
      },
      principalVariation: [bestMove],
    });
  }

  destroy(): void {}

  private bestMove(fen: string): string {
    const chess = new Chess(fen);
    if (chess.get('e2')?.color === 'w') return this.matchFirst ? 'e2e3' : 'e2e4';
    if (chess.turn() === 'b') return 'e7e5';
    return 'g1f3';
  }
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

  it('stores every review move while preserving learner-only training moves', async () => {
    const service = TestBed.inject(CoachAnalysisService);
    const game = importedGame();
    await service.load(game, 'white');
    await service.analyze(game, 'white');

    expect(engine.requests.map((request) => request.searchMove ?? 'best')).toEqual([
      'best',
      'e2e3',
      'best',
      'best',
    ]);
    expect(engine.requests.filter((request) => !request.searchMove)).toEqual([
      expect.objectContaining({ depth: 16, multiPv: 2 }),
      expect.objectContaining({ depth: 16, multiPv: 2 }),
      expect.objectContaining({ depth: 16, multiPv: 2 }),
    ]);
    expect(service.analysis()).toMatchObject({
      schemaVersion: 4,
      engineVersion: 'stockfish-18-single@18.0.8',
      depth: 16,
      status: 'complete',
      totalUserMoves: 2,
      moves: [
        {
          ply: 1,
          classification: 'mistake',
          reviewClassification: 'book',
          category: 'opening',
        },
        { ply: 3, classification: 'good', reviewClassification: 'best', centipawnLoss: 0 },
      ],
      reviewMoves: [
        { ply: 1, reviewClassification: 'book' },
        { ply: 2, reviewClassification: 'book' },
        { ply: 3, reviewClassification: 'best' },
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

    expect(service.state()).toMatchObject({ phase: 'partial', completed: 1, total: 3 });
    await expect(TestBed.inject(CoachRepositoryService).analysis(game.key)).resolves.toMatchObject({
      status: 'partial',
      moves: [{ ply: 1 }],
    });

    await service.analyze(game, 'white');
    expect(service.state()).toMatchObject({ phase: 'complete', completed: 3, total: 3 });
    expect(engine.requests).toHaveLength(4);
  });

  it('exposes engine startup before analysis progress begins', async () => {
    let releaseInitialization!: () => void;
    engine.initialization = new Promise((resolve) => {
      releaseInitialization = resolve;
    });
    const service = TestBed.inject(CoachAnalysisService);
    const game = importedGame();
    await service.load(game, 'white');

    const run = service.analyze(game, 'white');
    await waitFor(() => service.state().phase === 'starting');
    expect(engine.requests).toHaveLength(0);
    releaseInitialization();
    await run;

    expect(service.state().phase).toBe('complete');
  });

  it('reports startup failure and succeeds when analysis is retried', async () => {
    engine.initializationError = new Error('Stockfish analysis could not be started.');
    const service = TestBed.inject(CoachAnalysisService);
    const game = importedGame();
    await service.load(game, 'white');

    await service.analyze(game, 'white');
    expect(service.state()).toMatchObject({
      phase: 'error',
      error: 'Stockfish analysis could not be started.',
    });
    expect(engine.requests).toHaveLength(0);

    engine.initializationError = null;
    await service.analyze(game, 'white');
    expect(service.state().phase).toBe('complete');
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

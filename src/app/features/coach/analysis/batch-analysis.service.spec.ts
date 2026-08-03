import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { Chess, type Square } from 'chess.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AnalysisEnginePort,
  PositionAnalysisRequest,
  PositionAnalysisResult,
} from '../../../core/engine/analysis-engine.types';
import { parseImportedPgn } from '../parsing/pgn-parser';
import type { ImportedGame, ImportedProfile } from '../domain/coach.types';
import { CoachRepositoryService } from '../data/coach-repository.service';
import { BatchAnalysisService, BATCH_ANALYSIS_ENGINE_PORT } from './batch-analysis.service';

class FakeAnalysisEngine implements AnalysisEnginePort {
  readonly requests: PositionAnalysisRequest[] = [];
  initializationError: Error | null = null;
  failOnFen: string | null = null;
  blockOnFen: string | null = null;
  /** True while a request is suspended waiting for its signal to abort — lets tests wait for the
   * engine to actually be stuck before cancelling, instead of racing on request counts. */
  blocked = false;
  private blockedOnce = false;

  initialize(): Promise<void> {
    return this.initializationError ? Promise.reject(this.initializationError) : Promise.resolve();
  }

  analyze(request: PositionAnalysisRequest): Promise<PositionAnalysisResult> {
    this.requests.push(request);
    if (request.signal?.aborted) {
      return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    }
    if (this.failOnFen && request.fen === this.failOnFen) {
      return Promise.reject(new Error('Simulated engine failure.'));
    }
    if (this.blockOnFen && request.fen === this.blockOnFen && !this.blockedOnce) {
      this.blockedOnce = true;
      this.blocked = true;
      return new Promise((_, reject) => {
        request.signal?.addEventListener(
          'abort',
          () => {
            this.blocked = false;
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
      evaluation: { score: { kind: 'centipawn', value: played ? -20 : 30 }, depth: 16 },
      principalVariation: [bestMove],
    });
  }

  destroy(): void {}

  private bestMove(fen: string): string {
    const move = new Chess(fen).moves({ verbose: true })[0]!;
    return `${move.from}${move.to}`;
  }
}

const profiles: ImportedProfile[] = [
  {
    platform: 'lichess',
    username: 'Learner',
    displayName: 'Learner',
    profileUrl: '',
    updatedAt: '',
  },
];

describe('BatchAnalysisService', () => {
  let engine: FakeAnalysisEngine;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    });
    engine = new FakeAnalysisEngine();
    TestBed.configureTestingModule({
      providers: [{ provide: BATCH_ANALYSIS_ENGINE_PORT, useValue: engine }],
    });
  });

  it('analyzes queued games newest-first and persists each result', async () => {
    const service = TestBed.inject(BatchAnalysisService);
    const newer = importedGame('newer', '1. e3 e5 2. Nf3 Nc6', '2026-07-25T12:00:00.000Z');
    const older = importedGame('older', '1. d4 d5 2. Nf3 Nc6', '2026-07-20T12:00:00.000Z');

    await service.start([newer, older], profiles, [], 2);

    expect(service.state()).toMatchObject({ phase: 'complete', total: 2, completed: 2, failed: 0 });
    expect(engine.requests[0]?.fen).toBe(newer.moves[0]!.fenBefore);
    await expect(TestBed.inject(CoachRepositoryService).analysis(newer.key)).resolves.toMatchObject(
      { status: 'complete' },
    );
    await expect(TestBed.inject(CoachRepositoryService).analysis(older.key)).resolves.toMatchObject(
      { status: 'complete' },
    );
  });

  it('cancels mid-game, persists the partial result, and does not start the next game', async () => {
    const first = importedGame('first', '1. e3 e5 2. Nf3 Nc6', '2026-07-25T12:00:00.000Z');
    const second = importedGame('second', '1. d4 d5 2. Nf3 Nc6', '2026-07-20T12:00:00.000Z');
    engine.blockOnFen = first.moves[1]!.fenBefore;
    const service = TestBed.inject(BatchAnalysisService);

    const run = service.start([first, second], profiles, [], 2);
    await waitFor(() => engine.blocked);
    service.cancel();
    await run;

    expect(service.state()).toMatchObject({ phase: 'cancelled', completed: 0, failed: 0 });
    await expect(TestBed.inject(CoachRepositoryService).analysis(first.key)).resolves.toMatchObject(
      { status: 'partial', moves: [{ ply: 1 }] },
    );
    await expect(
      TestBed.inject(CoachRepositoryService).analysis(second.key),
    ).resolves.toBeUndefined();
  });

  it('resumes a cancelled game instead of restarting it, then continues the queue', async () => {
    const first = importedGame('first', '1. e3 e5 2. Nf3 Nc6', '2026-07-25T12:00:00.000Z');
    const second = importedGame('second', '1. d4 d5 2. Nf3 Nc6', '2026-07-20T12:00:00.000Z');
    engine.blockOnFen = first.moves[1]!.fenBefore;
    const service = TestBed.inject(BatchAnalysisService);

    const cancelledRun = service.start([first, second], profiles, [], 2);
    await waitFor(() => engine.blocked);
    service.cancel();
    await cancelledRun;
    engine.requests.length = 0;

    await service.start([first, second], profiles, [], 2);

    expect(service.state()).toMatchObject({ phase: 'complete', total: 2, completed: 2, failed: 0 });
    // Ply 1 of `first` was already saved before cancellation, so resuming must not search its
    // played move again — only its still-missing plies (2-4) and the untouched `second` game.
    expect(engine.requests.some((request) => request.searchMove === first.moves[0]!.uci)).toBe(
      false,
    );
    await expect(TestBed.inject(CoachRepositoryService).analysis(first.key)).resolves.toMatchObject(
      { status: 'complete' },
    );
    await expect(
      TestBed.inject(CoachRepositoryService).analysis(second.key),
    ).resolves.toMatchObject({ status: 'complete' });
  });

  it('skips a game whose engine call fails and continues the queue', async () => {
    const failing = importedGame('failing', '1. e3 e5 2. Nf3 Nc6', '2026-07-25T12:00:00.000Z');
    const healthy = importedGame('healthy', '1. d4 d5 2. Nf3 Nc6', '2026-07-20T12:00:00.000Z');
    engine.failOnFen = failing.moves[1]!.fenBefore;
    const service = TestBed.inject(BatchAnalysisService);

    await service.start([failing, healthy], profiles, [], 2);

    expect(service.state()).toMatchObject({ phase: 'complete', total: 2, completed: 1, failed: 1 });
    await expect(
      TestBed.inject(CoachRepositoryService).analysis(failing.key),
    ).resolves.toMatchObject({ status: 'partial', moves: [{ ply: 1 }] });
    await expect(
      TestBed.inject(CoachRepositoryService).analysis(healthy.key),
    ).resolves.toMatchObject({ status: 'complete' });
  });

  it('reports engine startup failure without starting any game', async () => {
    engine.initializationError = new Error('Stockfish analysis could not be started.');
    const game = importedGame('only', '1. e3 e5 2. Nf3 Nc6', '2026-07-25T12:00:00.000Z');
    const service = TestBed.inject(BatchAnalysisService);

    await service.start([game], profiles, [], 1);

    expect(service.state()).toMatchObject({
      phase: 'error',
      error: 'Stockfish analysis could not be started.',
    });
    expect(engine.requests).toHaveLength(0);
  });
});

function importedGame(key: string, pgn: string, endTime: string): ImportedGame {
  const parsed = parseImportedPgn(`[White "Learner"]
[Black "Opponent"]
[Result "*"]

${pgn} *`);
  return {
    key: `lichess:${key}`,
    platform: 'lichess',
    platformGameId: key,
    platformUrl: '',
    pgn: '',
    variant: 'standard',
    white: { username: 'Learner' },
    black: { username: 'Opponent' },
    result: '*',
    speed: 'rapid',
    timeControl: '600',
    rated: false,
    endTime,
    moves: parsed.moves,
    parseStatus: 'ready',
    profileKeys: ['lichess:learner'],
    firstImportedAt: endTime,
    lastImportedAt: endTime,
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  while (!predicate()) await new Promise((resolve) => setTimeout(resolve, 0));
}

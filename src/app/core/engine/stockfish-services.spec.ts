import { TestBed } from '@angular/core/testing';
import type { InjectionToken } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StockfishAnalysisEngineService } from './stockfish-analysis-engine.service';
import { StockfishEngineService } from './stockfish-engine.service';
import {
  STOCKFISH_ANALYSIS_WORKER_FACTORY,
  STOCKFISH_PLAY_WORKER_FACTORY,
  type StockfishWorkerFactory,
} from './stockfish-worker';

type WorkerMode = 'success' | 'manual' | 'error' | 'silent';

class FakeStockfishWorker {
  readonly messages: string[] = [];
  terminated = false;
  private readonly listeners = new Map<string, EventListener[]>();

  constructor(private readonly mode: WorkerMode) {}

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(command: string): void {
    this.messages.push(command);
    if (this.mode === 'silent') return;
    if (this.mode === 'error' && command === 'uci') {
      queueMicrotask(() => this.emit('error', new Event('error')));
      return;
    }
    if (command === 'uci') {
      queueMicrotask(() => this.message('uciok'));
    } else if (command === 'isready') {
      queueMicrotask(() => this.message('readyok'));
    } else if (command.startsWith('go depth') && this.mode !== 'manual') {
      queueMicrotask(() => {
        this.message('info depth 14 score cp 24 pv e2e4 e7e5');
        this.message('bestmove e2e4');
      });
    } else if (command.startsWith('go movetime') && this.mode !== 'manual') {
      queueMicrotask(() => this.message('bestmove e7e5'));
    } else if (command === 'stop' && this.mode === 'manual') {
      queueMicrotask(() => this.message('bestmove 0000'));
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  fail(): void {
    this.emit('error', new Event('error'));
  }

  sendLine(data: string): void {
    this.message(data);
  }

  private message(data: string): void {
    this.emit('message', new MessageEvent('message', { data }));
  }

  private emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function setupFactory(
  workerFactoryToken: InjectionToken<StockfishWorkerFactory>,
  ...modes: WorkerMode[]
) {
  const workers: FakeStockfishWorker[] = [];
  const factory: StockfishWorkerFactory = () => {
    const worker = new FakeStockfishWorker(modes[workers.length] ?? 'success');
    workers.push(worker);
    return worker as unknown as Worker;
  };
  TestBed.configureTestingModule({
    providers: [{ provide: workerFactoryToken, useValue: factory }],
  });
  return workers;
}

afterEach(() => {
  vi.useRealTimers();
  TestBed.resetTestingModule();
});

describe('StockfishEngineService', () => {
  it('initializes once and returns a searched move', async () => {
    const workers = setupFactory(STOCKFISH_PLAY_WORKER_FACTORY, 'success');
    const service = TestBed.runInInjectionContext(() => new StockfishEngineService());

    await Promise.all([service.initialize(), service.initialize()]);
    await service.newGame(1500);
    const move = await service.search({
      gameId: 'game',
      requestId: 1,
      fen: 'test-fen',
      botRating: 1500,
    });

    expect(workers).toHaveLength(1);
    expect(move.move).toEqual({ from: 'e7', to: 'e5' });
    expect(workers[0]?.messages).toContain('uci');
    expect(workers[0]?.messages).toContain('setoption name UCI_LimitStrength value true');
    expect(workers[0]?.messages).toContain('setoption name UCI_Elo value 1500');
    expect(workers[0]?.messages).toContain('go movetime 235');
  });

  it('replaces a failed startup worker once', async () => {
    const workers = setupFactory(STOCKFISH_PLAY_WORKER_FACTORY, 'error', 'success');
    const service = TestBed.runInInjectionContext(() => new StockfishEngineService());

    await service.initialize();

    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminated).toBe(true);
  });

  it('rejects after both startup attempts fail', async () => {
    const workers = setupFactory(STOCKFISH_PLAY_WORKER_FACTORY, 'error', 'error');
    const service = TestBed.runInInjectionContext(() => new StockfishEngineService());

    await expect(service.initialize()).rejects.toThrow('Stockfish Worker failed');
    expect(workers).toHaveLength(2);
    expect(workers.every((worker) => worker.terminated)).toBe(true);
  });

  it('rejects active work and can initialize a replacement after a worker failure', async () => {
    const workers = setupFactory(STOCKFISH_PLAY_WORKER_FACTORY, 'manual', 'success');
    const service = TestBed.runInInjectionContext(() => new StockfishEngineService());
    await service.initialize();
    const search = service.search({
      gameId: 'game',
      requestId: 1,
      fen: 'test-fen',
      botRating: 1500,
    });
    await vi.waitFor(() =>
      expect(workers[0]?.messages.some((message) => message.startsWith('go movetime'))).toBe(true),
    );
    workers[0]?.fail();

    await expect(search).rejects.toThrow('Stockfish Worker failed');
    await service.initialize();
    expect(workers).toHaveLength(2);
  });

  it('rejects initialization immediately when destroyed', async () => {
    setupFactory(STOCKFISH_PLAY_WORKER_FACTORY, 'silent');
    const service = TestBed.runInInjectionContext(() => new StockfishEngineService());
    const initialization = service.initialize();
    service.destroy();

    await expect(initialization).rejects.toThrow('Stockfish was stopped');
  });

  it('times out both startup attempts without leaking workers', async () => {
    vi.useFakeTimers();
    const workers = setupFactory(STOCKFISH_PLAY_WORKER_FACTORY, 'silent', 'silent');
    const service = TestBed.runInInjectionContext(() => new StockfishEngineService());
    const initialization = service.initialize();
    const rejection = expect(initialization).rejects.toThrow('Stockfish timed out');

    await vi.advanceTimersByTimeAsync(40_000);

    await rejection;
    expect(workers).toHaveLength(2);
    expect(workers.every((worker) => worker.terminated)).toBe(true);
  });
});

describe('StockfishAnalysisEngineService', () => {
  it('retries startup and returns an evaluation', async () => {
    const workers = setupFactory(STOCKFISH_ANALYSIS_WORKER_FACTORY, 'error', 'success');
    const service = TestBed.runInInjectionContext(() => new StockfishAnalysisEngineService());

    const result = await service.analyze({
      fen: 'test-fen',
      depth: 14,
    });

    expect(workers).toHaveLength(2);
    expect(result.bestMove).toEqual({ from: 'e2', to: 'e4' });
    expect(result.evaluation.score).toEqual({ kind: 'centipawn', value: 24 });
  });

  it('rejects active analysis when its worker fails and starts cleanly afterward', async () => {
    const workers = setupFactory(STOCKFISH_ANALYSIS_WORKER_FACTORY, 'manual', 'success');
    const service = TestBed.runInInjectionContext(() => new StockfishAnalysisEngineService());
    await service.initialize();
    const analysis = service.analyze({ fen: 'test-fen', depth: 14 });
    await vi.waitFor(() =>
      expect(workers[0]?.messages.some((message) => message.startsWith('go depth'))).toBe(true),
    );
    workers[0]?.fail();

    await expect(analysis).rejects.toThrow('Stockfish Worker failed');
    await service.initialize();
    expect(workers).toHaveLength(2);
  });

  it('cancels an active analysis with an AbortError', async () => {
    const workers = setupFactory(STOCKFISH_ANALYSIS_WORKER_FACTORY, 'manual');
    const service = TestBed.runInInjectionContext(() => new StockfishAnalysisEngineService());
    await service.initialize();
    const controller = new AbortController();
    const analysis = service.analyze({
      fen: 'test-fen',
      depth: 14,
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(workers[0]?.messages.some((message) => message.startsWith('go depth'))).toBe(true),
    );
    controller.abort();

    await expect(analysis).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0]?.messages).toContain('stop');
  });

  it('streams only complete, increasing MultiPV depth batches and still resolves normally', async () => {
    const workers = setupFactory(STOCKFISH_ANALYSIS_WORKER_FACTORY, 'manual');
    const service = TestBed.runInInjectionContext(() => new StockfishAnalysisEngineService());
    const progress = vi.fn();
    const analysis = service.analyze({
      fen: 'test-fen',
      depth: 16,
      multiPv: 3,
      onProgress: progress,
    });
    await vi.waitFor(() =>
      expect(workers[0]?.messages.some((message) => message.startsWith('go depth'))).toBe(true),
    );

    workers[0]?.sendLine('info depth 8 multipv 1 score cp 20 pv e2e4 e7e5');
    workers[0]?.sendLine('info depth 8 multipv 2 score cp 10 pv d2d4 d7d5');
    expect(progress).not.toHaveBeenCalled();
    workers[0]?.sendLine('info depth 8 multipv 3 score cp 5 pv g1f3 g8f6');
    workers[0]?.sendLine('info depth 7 multipv 1 score cp 18 pv e2e4');
    workers[0]?.sendLine('info depth 7 multipv 2 score cp 8 pv d2d4');
    workers[0]?.sendLine('info depth 7 multipv 3 score cp 4 pv g1f3');
    workers[0]?.sendLine('info depth 16 multipv 1 score cp 25 pv e2e4 e7e5');
    workers[0]?.sendLine('info depth 16 multipv 2 score cp 12 pv d2d4 d7d5');
    workers[0]?.sendLine('info depth 16 multipv 3 score cp 7 pv g1f3 g8f6');
    workers[0]?.sendLine('bestmove e2e4');

    await expect(analysis).resolves.toMatchObject({
      bestMove: { from: 'e2', to: 'e4' },
      variations: [{ rank: 1 }, { rank: 2 }, { rank: 3 }],
    });
    expect(progress.mock.calls.map(([snapshot]) => snapshot.depth)).toEqual([8, 16]);
  });
});

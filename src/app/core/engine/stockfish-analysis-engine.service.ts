import { Injectable, inject } from '@angular/core';
import type {
  AnalysisEnginePort,
  PositionAnalysisRequest,
  PositionAnalysisResult,
} from './analysis-engine.types';
import { parseBestMove } from './uci-parser';
import { parseAnalysisInfo, type UciAnalysisInfo } from './uci-analysis-parser';
import { STOCKFISH_WORKER_FACTORY } from './stockfish-worker';

type Waiter = {
  predicate: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

@Injectable()
export class StockfishAnalysisEngineService implements AnalysisEnginePort {
  private readonly createStockfishWorker = inject(STOCKFISH_WORKER_FACTORY);
  private worker: Worker | null = null;
  private waiters: Waiter[] = [];
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private lifecycle = 0;
  private active:
    | {
        resolve: (value: PositionAnalysisResult) => void;
        reject: (error: Error) => void;
        infos: Map<number, UciAnalysisInfo>;
        abort?: () => void;
        signal?: AbortSignal;
      }
    | undefined;

  async analyze(request: PositionAnalysisRequest): Promise<PositionAnalysisResult> {
    await this.initialize();
    if (request.signal?.aborted) throw abortError();
    if (this.active) throw new Error('Stockfish analysis is already running.');

    await this.waitFor('readyok', 5000, () => this.post('isready'));
    this.post(`setoption name MultiPV value ${request.multiPv ?? 1}`);
    this.post('setoption name UCI_ShowWDL value true');
    this.post(`position fen ${request.fen}`);

    return new Promise<PositionAnalysisResult>((resolve, reject) => {
      const abort = () => {
        this.post('stop');
        this.finishActive(undefined, abortError());
      };
      this.active = {
        resolve,
        reject,
        abort: request.signal ? abort : undefined,
        signal: request.signal,
        infos: new Map(),
      };
      request.signal?.addEventListener('abort', abort, { once: true });
      const forcedMove = request.searchMove ? ` searchmoves ${request.searchMove}` : '';
      this.post(`go depth ${request.depth}${forcedMove}`);
    });
  }

  destroy(): void {
    this.lifecycle += 1;
    this.initializing = null;
    this.disposeWorker(new Error('Stockfish analysis was stopped.'));
  }

  initialize(): Promise<void> {
    if (this.initialized && this.worker) return Promise.resolve();
    const lifecycle = this.lifecycle;
    this.initializing ??= this.initializeWithRetry(lifecycle).finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }

  private async initializeWithRetry(lifecycle: number): Promise<void> {
    try {
      await this.createWorker(lifecycle);
    } catch (error) {
      if (lifecycle !== this.lifecycle) {
        throw asError(error, 'Stockfish analysis was stopped.');
      }
      this.disposeWorker(new Error('Retrying Stockfish analysis initialization.'));
      await this.createWorker(lifecycle).catch((retryError: unknown) => {
        const failure = asError(retryError, 'Stockfish analysis could not be started.');
        this.disposeWorker(failure);
        throw failure;
      });
    }
  }

  private async createWorker(lifecycle: number): Promise<void> {
    const worker = this.createStockfishWorker();
    this.worker = worker;
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (worker === this.worker && typeof event.data === 'string') this.handleLine(event.data);
    });
    worker.addEventListener('error', () => {
      if (worker === this.worker) this.disposeWorker(new Error('Stockfish Worker failed.'));
    });
    worker.addEventListener('messageerror', () => {
      if (worker === this.worker) {
        this.disposeWorker(new Error('Stockfish sent an unreadable message.'));
      }
    });
    await this.waitFor('uciok', 20000, () => this.post('uci'));
    this.post('setoption name UCI_ShowWDL value true');
    await this.waitFor('readyok', 10000, () => this.post('isready'));
    if (worker !== this.worker || lifecycle !== this.lifecycle) {
      throw new Error('Stockfish analysis was stopped.');
    }
    this.initialized = true;
  }

  private handleLine(line: string): void {
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(line)) continue;
      clearTimeout(waiter.timeout);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve(line);
    }

    const info = parseAnalysisInfo(line);
    if (info && !info.bounded && this.active) {
      this.active.infos.set(info.multiPv ?? 1, info);
      return;
    }

    const bestMove = parseBestMove(line);
    if (bestMove === undefined || !this.active) return;
    const infoResult = this.active.infos.get(1);
    if (!infoResult) {
      this.finishActive(undefined, new Error('Stockfish returned no evaluation.'));
      return;
    }
    this.finishActive({
      bestMove,
      evaluation: infoResult.evaluation,
      principalVariation: infoResult.principalVariation,
      ...(infoResult.expectedPoints === undefined
        ? {}
        : { expectedPoints: infoResult.expectedPoints }),
      variations: [...this.active.infos.entries()]
        .sort(([left], [right]) => left - right)
        .map(([rank, variation]) => ({
          rank,
          evaluation: variation.evaluation,
          principalVariation: variation.principalVariation,
          ...(variation.expectedPoints === undefined
            ? {}
            : { expectedPoints: variation.expectedPoints }),
        })),
    });
  }

  private finishActive(result?: PositionAnalysisResult, error?: Error): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    if (active.abort) active.signal?.removeEventListener('abort', active.abort);
    if (error) active.reject(error);
    else if (result) active.resolve(result);
  }

  private waitFor(expected: string, timeoutMs: number, send: () => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        predicate: (line) => line.trim() === expected,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new Error(`Stockfish timed out waiting for ${expected}.`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
      send();
    });
  }

  private post(command: string): void {
    if (!this.worker) throw new Error('Stockfish analysis is unavailable.');
    this.worker.postMessage(command);
  }

  private disposeWorker(error: Error): void {
    this.initialized = false;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    this.finishActive(undefined, error);
    this.worker?.terminate();
    this.worker = null;
  }
}

function abortError(): DOMException {
  return new DOMException('Analysis cancelled.', 'AbortError');
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

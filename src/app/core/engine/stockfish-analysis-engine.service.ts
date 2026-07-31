import { Injectable, inject } from '@angular/core';
import { markStockfishEngineDownloaded } from './stockfish-assets';
import type {
  AnalysisEnginePort,
  PositionAnalysisRequest,
  PositionAnalysisResult,
  PositionAnalysisSnapshot,
} from './analysis-engine.types';
import { parseBestMove } from './uci-parser';
import { parseAnalysisInfo, type UciAnalysisInfo } from './uci-analysis-parser';
import { STOCKFISH_ANALYSIS_WORKER_FACTORY } from './stockfish-worker';

type Waiter = {
  predicate: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

@Injectable()
export class StockfishAnalysisEngineService implements AnalysisEnginePort {
  private readonly createStockfishWorker = inject(STOCKFISH_ANALYSIS_WORKER_FACTORY);
  private worker: Worker | null = null;
  private waiters: Waiter[] = [];
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private lifecycle = 0;
  private idleWaiters: Array<() => void> = [];
  private active:
    | {
        resolve: (value: PositionAnalysisResult) => void;
        reject: (error: Error) => void;
        infos: Map<number, UciAnalysisInfo>;
        batches: Map<number, Map<number, UciAnalysisInfo>>;
        multiPv: number;
        onProgress?: (snapshot: PositionAnalysisSnapshot) => void;
        lastProgressDepth: number;
        abort?: () => void;
        signal?: AbortSignal;
        cancelled?: boolean;
        cancelTimeout?: ReturnType<typeof setTimeout>;
      }
    | undefined;

  async analyze(request: PositionAnalysisRequest): Promise<PositionAnalysisResult> {
    await this.initialize();
    if (request.signal?.aborted) throw abortError();
    if (this.active?.cancelled) await this.waitForIdle(request.signal);
    if (request.signal?.aborted) throw abortError();
    if (this.active) throw new Error('Stockfish analysis is already running.');

    await this.waitFor('readyok', 5000, () => this.post('isready'));
    this.post(`setoption name MultiPV value ${request.multiPv ?? 1}`);
    this.post('setoption name UCI_ShowWDL value true');
    this.post(`position fen ${request.fen}`);

    return new Promise<PositionAnalysisResult>((resolve, reject) => {
      const abort = () => {
        if (!this.active || this.active.cancelled) return;
        this.active.cancelled = true;
        this.post('stop');
        this.active.cancelTimeout = setTimeout(
          () => this.finishActive(undefined, abortError()),
          2000,
        );
      };
      this.active = {
        resolve,
        reject,
        abort: request.signal ? abort : undefined,
        signal: request.signal,
        infos: new Map(),
        batches: new Map(),
        multiPv: request.multiPv ?? 1,
        onProgress: request.onProgress,
        lastProgressDepth: 0,
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
    markStockfishEngineDownloaded('analysis');
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
      const rank = info.multiPv ?? 1;
      this.active.infos.set(rank, info);
      const depthBatch = this.active.batches.get(info.evaluation.depth) ?? new Map();
      depthBatch.set(rank, info);
      this.active.batches.set(info.evaluation.depth, depthBatch);
      this.emitProgress(info.evaluation.depth);
      return;
    }

    const bestMove = parseBestMove(line);
    if (bestMove === undefined || !this.active) return;
    if (this.active.cancelled) {
      this.finishActive(undefined, abortError());
      return;
    }
    const completeBatch = [...this.active.batches.entries()]
      .filter(([, batch]) => batch.has(1))
      .sort(([left], [right]) => right - left)[0]?.[1];
    const finalInfos = completeBatch ?? this.active.infos;
    const infoResult = finalInfos.get(1);
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
      variations: [...finalInfos.entries()]
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

  private emitProgress(depth: number): void {
    const active = this.active;
    if (!active || active.cancelled || !active.onProgress || depth <= active.lastProgressDepth) {
      return;
    }
    const batch = active.batches.get(depth);
    if (!batch || batch.size < active.multiPv) return;
    const variations = Array.from({ length: active.multiPv }, (_, index) => {
      const rank = index + 1;
      const variation = batch.get(rank);
      return variation
        ? {
            rank,
            evaluation: variation.evaluation,
            principalVariation: variation.principalVariation,
            ...(variation.expectedPoints === undefined
              ? {}
              : { expectedPoints: variation.expectedPoints }),
          }
        : null;
    });
    if (variations.some((variation) => variation === null)) return;
    active.lastProgressDepth = depth;
    const complete = variations.filter(
      (variation): variation is NonNullable<typeof variation> => variation !== null,
    );
    const snapshot: PositionAnalysisSnapshot = {
      depth,
      evaluation: complete[0]!.evaluation,
      variations: complete,
    };
    try {
      active.onProgress(snapshot);
    } catch {
      // A view callback must not interrupt the engine search or its final promise.
    }
  }

  private finishActive(result?: PositionAnalysisResult, error?: Error): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    if (active.cancelTimeout) clearTimeout(active.cancelTimeout);
    if (active.abort) active.signal?.removeEventListener('abort', active.abort);
    for (const resolve of this.idleWaiters.splice(0)) resolve();
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

  private waitForIdle(signal?: AbortSignal): Promise<void> {
    if (!this.active) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        this.idleWaiters.splice(this.idleWaiters.indexOf(finish), 1);
        reject(abortError());
      };
      this.idleWaiters.push(finish);
      signal?.addEventListener('abort', abort, { once: true });
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

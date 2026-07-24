import { Injectable } from '@angular/core';
import type {
  AnalysisEnginePort,
  PositionAnalysisRequest,
  PositionAnalysisResult,
} from './analysis-engine.types';
import { parseBestMove } from './uci-parser';
import { parseAnalysisInfo, type UciAnalysisInfo } from './uci-analysis-parser';

type Waiter = {
  predicate: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

@Injectable()
export class StockfishAnalysisEngineService implements AnalysisEnginePort {
  private worker: Worker | null = null;
  private waiters: Waiter[] = [];
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private active:
    | {
        resolve: (value: PositionAnalysisResult) => void;
        reject: (error: Error) => void;
        info?: UciAnalysisInfo;
        abort?: () => void;
        signal?: AbortSignal;
      }
    | undefined;

  async analyze(request: PositionAnalysisRequest): Promise<PositionAnalysisResult> {
    await this.initialize();
    if (request.signal?.aborted) throw abortError();
    if (this.active) throw new Error('Stockfish analysis is already running.');

    await this.waitFor('readyok', 5000, () => this.post('isready'));
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
      };
      request.signal?.addEventListener('abort', abort, { once: true });
      const forcedMove = request.searchMove ? ` searchmoves ${request.searchMove}` : '';
      this.post(`go depth ${request.depth}${forcedMove}`);
    });
  }

  destroy(): void {
    this.dispose(new Error('Stockfish analysis was stopped.'));
  }

  private async initialize(): Promise<void> {
    if (this.initialized && this.worker) return;
    this.initializing ??= this.createWorker().finally(() => {
      this.initializing = null;
    });
    await this.initializing;
  }

  private async createWorker(): Promise<void> {
    const workerUrl = new URL('assets/stockfish/stockfish-18-lite-single.js', document.baseURI);
    const worker = new Worker(workerUrl);
    this.worker = worker;
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data === 'string') this.handleLine(event.data);
    });
    worker.addEventListener('error', () => this.dispose(new Error('Stockfish Worker failed.')));
    worker.addEventListener('messageerror', () =>
      this.dispose(new Error('Stockfish sent an unreadable message.')),
    );
    await this.waitFor('uciok', 20000, () => this.post('uci'));
    await this.waitFor('readyok', 10000, () => this.post('isready'));
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
      this.active.info = info;
      return;
    }

    const bestMove = parseBestMove(line);
    if (bestMove === undefined || !this.active) return;
    const infoResult = this.active.info;
    if (!infoResult) {
      this.finishActive(undefined, new Error('Stockfish returned no evaluation.'));
      return;
    }
    this.finishActive({
      bestMove,
      evaluation: infoResult.evaluation,
      principalVariation: infoResult.principalVariation,
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

  private dispose(error: Error): void {
    this.initialized = false;
    this.initializing = null;
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

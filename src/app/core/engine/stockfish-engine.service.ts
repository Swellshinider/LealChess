import { Injectable } from '@angular/core';
import { getDifficulty } from './difficulty';
import type { EngineMove, EnginePort, EngineSearchRequest } from './engine.types';
import { parseBestMove } from './uci-parser';
import type { DifficultyId } from '../game/game.types';

type Waiter = {
  predicate: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

@Injectable()
export class StockfishEngineService implements EnginePort {
  private worker: Worker | null = null;
  private waiters: Waiter[] = [];
  private activeSearch: {
    request: EngineSearchRequest;
    resolve: (move: EngineMove) => void;
    reject: (error: Error) => void;
  } | null = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private lifecycle = 0;

  initialize(): Promise<void> {
    if (this.initialized && this.worker) {
      return Promise.resolve();
    }
    const lifecycle = this.lifecycle;
    this.initializing ??= this.initializeWithRetry(lifecycle).finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }

  private async initializeWithRetry(lifecycle: number): Promise<void> {
    try {
      await this.createAndInitializeWorker();
    } catch (error) {
      if (lifecycle !== this.lifecycle) {
        throw this.asError(error, 'Stockfish was stopped.');
      }
      this.disposeWorker(new Error('Retrying Stockfish initialization.'));
      await this.createAndInitializeWorker().catch((retryError: unknown) => {
        throw this.asError(retryError, 'Stockfish could not be started.');
      });
    }
  }

  async newGame(difficulty: DifficultyId): Promise<void> {
    await this.ensureInitialized();
    await this.stopInternal();
    this.post('ucinewgame');
    this.applyDifficulty(difficulty);
    await this.waitFor('readyok', 5000, () => this.post('isready'));
  }

  async search(request: EngineSearchRequest): Promise<EngineMove> {
    await this.ensureInitialized();
    await this.stopInternal();
    this.applyDifficulty(request.difficulty);
    await this.waitFor('readyok', 5000, () => this.post('isready'));

    const preset = getDifficulty(request.difficulty);
    this.post(`position fen ${request.fen}`);

    return new Promise<EngineMove>((resolve, reject) => {
      this.activeSearch = { request, resolve, reject };
      this.post(`go movetime ${preset.moveTimeMs}`);
    });
  }

  async stop(): Promise<void> {
    await this.stopInternal();
  }

  destroy(): void {
    this.lifecycle += 1;
    this.initializing = null;
    this.disposeWorker(new Error('Stockfish was stopped.'));
  }

  private async createAndInitializeWorker(): Promise<void> {
    const workerUrl = new URL('assets/stockfish/stockfish-18-lite-single.js', document.baseURI);
    const worker = new Worker(workerUrl);
    this.worker = worker;

    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data === 'string') {
        this.handleLine(event.data);
      }
    });
    worker.addEventListener('error', () => {
      this.failWorker(new Error('Stockfish Worker failed.'));
    });
    worker.addEventListener('messageerror', () => {
      this.failWorker(new Error('Stockfish sent an unreadable message.'));
    });

    await this.waitFor('uciok', 20000, () => this.post('uci'));
    await this.waitFor('readyok', 10000, () => this.post('isready'));
    this.initialized = true;
  }

  private handleLine(line: string): void {
    for (const waiter of [...this.waiters]) {
      if (waiter.predicate(line)) {
        clearTimeout(waiter.timeout);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(line);
      }
    }

    const parsed = parseBestMove(line);
    if (parsed === undefined || !this.activeSearch) {
      return;
    }

    const active = this.activeSearch;
    this.activeSearch = null;
    active.resolve({
      gameId: active.request.gameId,
      requestId: active.request.requestId,
      fen: active.request.fen,
      move: parsed,
    });
  }

  private async stopInternal(): Promise<void> {
    if (!this.activeSearch) {
      return;
    }

    const active = this.activeSearch;
    this.post('stop');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.activeSearch === active) {
          this.activeSearch = null;
          active.reject(new Error('Stockfish did not stop in time.'));
        }
        resolve();
      }, 1500);

      const originalResolve = active.resolve;
      active.resolve = (move) => {
        clearTimeout(timeout);
        originalResolve(move);
        resolve();
      };
    });
  }

  private applyDifficulty(difficulty: DifficultyId): void {
    const preset = getDifficulty(difficulty);
    this.post(`setoption name Skill Level value ${preset.skillLevel}`);
  }

  private waitFor(expected: string, timeoutMs: number, beforeWait: () => void): Promise<string> {
    return new Promise<string>((resolve, reject) => {
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
      beforeWait();
    });
  }

  private post(command: string): void {
    if (!this.worker) {
      throw new Error('Stockfish is not available.');
    }
    this.worker.postMessage(command);
  }

  private ensureInitialized(): Promise<void> {
    return this.initialized && this.worker ? Promise.resolve() : this.initialize();
  }

  private failWorker(error: Error): void {
    this.disposeWorker(error);
  }

  private disposeWorker(error: Error): void {
    this.initialized = false;
    this.rejectPending(error);
    this.worker?.terminate();
    this.worker = null;
  }

  private rejectPending(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    this.activeSearch?.reject(error);
    this.activeSearch = null;
  }

  private asError(error: unknown, fallback: string): Error {
    return error instanceof Error ? error : new Error(fallback);
  }
}

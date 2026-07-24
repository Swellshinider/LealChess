import { InjectionToken } from '@angular/core';

export type StockfishWorkerFactory = () => Worker;

export const STOCKFISH_WORKER_FACTORY = new InjectionToken<StockfishWorkerFactory>(
  'STOCKFISH_WORKER_FACTORY',
  {
    providedIn: 'root',
    factory: () => () =>
      new Worker(new URL('assets/stockfish/stockfish-18-lite-single.js', document.baseURI)),
  },
);

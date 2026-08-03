import { InjectionToken } from '@angular/core';
import { inject } from '@angular/core';
import type { AnalysisEngineId } from './analysis-profiles';
import { EngineAssetManagerService, type EngineWorkerLease } from './engine-asset-manager.service';

export type StockfishWorkerFactory = (
  engineId?: AnalysisEngineId,
) => Worker | EngineWorkerLease | Promise<Worker | EngineWorkerLease>;

export const STOCKFISH_PLAY_WORKER_FACTORY = new InjectionToken<StockfishWorkerFactory>(
  'STOCKFISH_PLAY_WORKER_FACTORY',
  {
    providedIn: 'root',
    factory: () => {
      const assets = inject(EngineAssetManagerService);
      return () => assets.acquireWorker('stockfish-18-lite');
    },
  },
);

export const STOCKFISH_ANALYSIS_WORKER_FACTORY = new InjectionToken<StockfishWorkerFactory>(
  'STOCKFISH_ANALYSIS_WORKER_FACTORY',
  {
    providedIn: 'root',
    factory: () => {
      const assets = inject(EngineAssetManagerService);
      return (engineId = 'stockfish-18-full') => assets.acquireWorker(engineId);
    },
  },
);

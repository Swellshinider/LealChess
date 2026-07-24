import { provideBrowserGlobalErrorListeners } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { ENGINE_PORT } from './core/engine/engine.types';
import { StockfishEngineService } from './core/engine/stockfish-engine.service';
import { IndexedDbPersistenceService } from './core/persistence/indexed-db-persistence.service';
import { PERSISTENCE_PORT } from './core/persistence/persistence.types';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    { provide: ENGINE_PORT, useClass: StockfishEngineService },
    { provide: PERSISTENCE_PORT, useClass: IndexedDbPersistenceService },
  ],
};

import { inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { ENGINE_PORT } from './core/engine/engine.types';
import { StockfishEngineService } from './core/engine/stockfish-engine.service';
import { ANALYSIS_ENGINE_PORT } from './core/engine/analysis-engine.types';
import { StockfishAnalysisEngineService } from './core/engine/stockfish-analysis-engine.service';
import { IndexedDbPersistenceService } from './core/persistence/indexed-db-persistence.service';
import { PERSISTENCE_PORT } from './core/persistence/persistence.types';
import { provideClientHydration } from '@angular/platform-browser';
import { SeoService } from './core/seo/seo.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    { provide: ENGINE_PORT, useClass: StockfishEngineService },
    { provide: ANALYSIS_ENGINE_PORT, useClass: StockfishAnalysisEngineService },
    { provide: PERSISTENCE_PORT, useClass: IndexedDbPersistenceService },
    provideClientHydration(),
    provideAppInitializer(() => inject(SeoService).initialize()),
  ],
};

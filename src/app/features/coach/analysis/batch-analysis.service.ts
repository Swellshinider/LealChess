import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import type { AnalysisEnginePort } from '../../../core/engine/analysis-engine.types';
import { AnalysisSettingsService } from '../../../core/engine/analysis-settings.service';
import { CoachRepositoryService } from '../data/coach-repository.service';
import type { GameAnalysis, ImportedGame, ImportedProfile } from '../domain/coach.types';
import { learnerColorForGame } from './analysis-rules';
import { selectGamesForBatchAnalysis } from './batch-analysis-selection';
import { prepareGameAnalysis, runGameAnalysis } from './game-analysis-runner';

export const BATCH_ANALYSIS_ENGINE_PORT = new InjectionToken<AnalysisEnginePort>(
  'BATCH_ANALYSIS_ENGINE_PORT',
);

export type BatchAnalysisPhase =
  'idle' | 'starting' | 'running' | 'cancelled' | 'complete' | 'error';

export interface BatchAnalysisState {
  phase: BatchAnalysisPhase;
  total: number;
  completed: number;
  failed: number;
  currentIndex: number;
  currentGameKey: string | null;
  currentMoves: { completed: number; total: number };
  error: string | null;
}

const INITIAL_STATE: BatchAnalysisState = {
  phase: 'idle',
  total: 0,
  completed: 0,
  failed: 0,
  currentIndex: 0,
  currentGameKey: null,
  currentMoves: { completed: 0, total: 0 },
  error: null,
};

/** Analyzes a queue of imported games in the background, independent of the Review page and its
 * own engine worker. The run survives navigation away from the Learn page because this service is
 * provided in root and only the panel component observing it is destroyed. */
@Injectable({ providedIn: 'root' })
export class BatchAnalysisService {
  private readonly engine = inject(BATCH_ANALYSIS_ENGINE_PORT);
  private readonly repository = inject(CoachRepositoryService);
  private readonly settings = inject(AnalysisSettingsService);
  private readonly mutableState = signal<BatchAnalysisState>(INITIAL_STATE);
  private abortController: AbortController | null = null;

  readonly state = this.mutableState.asReadonly();
  readonly active = computed(() => {
    const phase = this.mutableState().phase;
    return phase === 'starting' || phase === 'running';
  });
  readonly progress = computed(() => {
    const state = this.mutableState();
    if (!state.total) return 0;
    const currentFraction = state.currentMoves.total
      ? state.currentMoves.completed / state.currentMoves.total
      : 0;
    return Math.round(((state.completed + currentFraction) / state.total) * 100);
  });

  async start(
    games: readonly ImportedGame[],
    profiles: readonly ImportedProfile[],
    analyses: readonly GameAnalysis[],
    count: number,
  ): Promise<void> {
    if (this.active()) return;
    const queue = selectGamesForBatchAnalysis(games, profiles, analyses, count);
    if (!queue.length) return;
    this.abortController = new AbortController();
    this.mutableState.set({
      ...INITIAL_STATE,
      phase: 'starting',
      total: queue.length,
    });

    try {
      const profile = await this.settings.profile('game-review');
      await this.engine.initialize(profile.engineId);
      if (this.abortController.signal.aborted) {
        throw new DOMException('Analysis cancelled.', 'AbortError');
      }
      this.mutableState.update((state) => ({ ...state, phase: 'running' }));

      let completed = 0;
      let failed = 0;
      for (const [index, game] of queue.entries()) {
        // The queue was built by selectGamesForBatchAnalysis against these same profiles, so a
        // learner color is guaranteed to resolve here.
        const learnerColor = learnerColorForGame(game, [...profiles])!;
        this.mutableState.update((state) => ({
          ...state,
          currentIndex: index + 1,
          currentGameKey: game.key,
          currentMoves: { completed: 0, total: game.moves.length },
        }));
        try {
          const cached = await this.repository.analysis(game.key);
          const { analysis: base } = await prepareGameAnalysis({
            game,
            learnerColor,
            cached: cached ?? null,
            profile,
            restart: false,
          });
          await runGameAnalysis({
            game,
            learnerColor,
            profile,
            base,
            engine: this.engine,
            signal: this.abortController.signal,
            save: (next) => this.repository.saveAnalysis(next),
            onMove: (next) => {
              this.mutableState.update((state) => ({
                ...state,
                currentMoves: {
                  completed: next.reviewMoves?.length ?? 0,
                  total: game.moves.length,
                },
              }));
            },
          });
          completed += 1;
          this.mutableState.update((state) => ({ ...state, completed }));
        } catch (error) {
          if (isAbort(error)) throw error;
          failed += 1;
          this.mutableState.update((state) => ({ ...state, failed }));
        }
      }

      this.mutableState.update((state) => ({ ...state, phase: 'complete' }));
    } catch (error) {
      const cancelled = isAbort(error);
      this.mutableState.update((state) => ({
        ...state,
        phase: cancelled ? 'cancelled' : 'error',
        error: cancelled ? null : error instanceof Error ? error.message : 'Analysis failed.',
      }));
    } finally {
      this.abortController = null;
      this.engine.destroy();
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  reset(): void {
    this.cancel();
    this.mutableState.set(INITIAL_STATE);
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

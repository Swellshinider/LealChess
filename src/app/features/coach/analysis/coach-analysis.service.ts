import { Injectable, inject, signal } from '@angular/core';
import { ANALYSIS_ENGINE_PORT } from '../../../core/engine/analysis-engine.types';
import { analysisProfileFingerprint } from '../../../core/engine/analysis-profiles';
import { AnalysisSettingsService } from '../../../core/engine/analysis-settings.service';
import type { ChessColor } from '../../../shared/chess/chess.types';
import { CoachRepositoryService } from '../data/coach-repository.service';
import type { GameAnalysis, ImportedGame } from '../domain/coach.types';
import { analysisFingerprint } from './analysis-rules';
import { prepareGameAnalysis, runGameAnalysis } from './game-analysis-runner';

export type AnalysisPhase =
  'idle' | 'ready' | 'starting' | 'running' | 'partial' | 'complete' | 'error';

export interface AnalysisViewState {
  phase: AnalysisPhase;
  completed: number;
  total: number;
  error: string | null;
  stale?: boolean;
}

const INITIAL_STATE: AnalysisViewState = {
  phase: 'idle',
  completed: 0,
  total: 0,
  error: null,
};

@Injectable({ providedIn: 'root' })
export class CoachAnalysisService {
  private readonly engine = inject(ANALYSIS_ENGINE_PORT);
  private readonly repository = inject(CoachRepositoryService);
  private readonly settings = inject(AnalysisSettingsService);
  private readonly mutableAnalysis = signal<GameAnalysis | null>(null);
  private readonly mutableState = signal<AnalysisViewState>(INITIAL_STATE);
  private abortController: AbortController | null = null;

  readonly analysis = this.mutableAnalysis.asReadonly();
  readonly state = this.mutableState.asReadonly();

  async load(game: ImportedGame, learnerColor: ChessColor): Promise<void> {
    const [cached, fingerprint, profile] = await Promise.all([
      this.repository.analysis(game.key),
      analysisFingerprint(game, learnerColor),
      this.settings.profile('game-review'),
    ]);
    const analysis = cached?.sourceFingerprint === fingerprint ? cached : null;
    const profileFingerprint = analysisProfileFingerprint(profile);
    const stale = Boolean(
      analysis &&
      analysis.profileFingerprint !== profileFingerprint &&
      !(analysis.profileFingerprint === undefined && analysis.depth === 16),
    );
    this.mutableAnalysis.set(analysis);
    this.mutableState.set({
      phase: analysis?.status === 'complete' ? 'complete' : analysis ? 'partial' : 'ready',
      completed: analysis?.reviewMoves?.length ?? analysis?.moves.length ?? 0,
      total: game.moves.length,
      error: null,
      stale,
    });
  }

  async analyze(game: ImportedGame, learnerColor: ChessColor): Promise<void> {
    await this.runAnalysis(game, learnerColor, false);
  }

  async reanalyze(game: ImportedGame, learnerColor: ChessColor): Promise<void> {
    await this.runAnalysis(game, learnerColor, true);
  }

  private async runAnalysis(
    game: ImportedGame,
    learnerColor: ChessColor,
    restart: boolean,
  ): Promise<void> {
    if (this.abortController) return;
    const profile = await this.settings.profile('game-review');
    const { analysis: prepared } = await prepareGameAnalysis({
      game,
      learnerColor,
      cached: this.mutableAnalysis(),
      profile,
      restart,
    });
    let analysis = prepared;
    this.mutableAnalysis.set(analysis);
    if (restart) await this.repository.saveAnalysis(analysis);
    this.abortController = new AbortController();
    this.mutableState.set({
      phase: 'starting',
      completed: analysis.reviewMoves?.length ?? 0,
      total: game.moves.length,
      error: null,
    });

    try {
      await this.engine.initialize(profile.engineId);
      if (this.abortController.signal.aborted) {
        throw new DOMException('Analysis cancelled.', 'AbortError');
      }
      this.mutableState.update((state) => ({ ...state, phase: 'running' }));
      analysis = await runGameAnalysis({
        game,
        learnerColor,
        profile,
        base: analysis,
        engine: this.engine,
        signal: this.abortController.signal,
        save: (next) => this.repository.saveAnalysis(next),
        onMove: (next) => {
          analysis = next;
          this.mutableAnalysis.set(next);
          this.mutableState.update((state) => ({
            ...state,
            completed: next.reviewMoves?.length ?? 0,
          }));
        },
      });
      this.mutableAnalysis.set(analysis);
      this.mutableState.set({
        phase: 'complete',
        completed: analysis.reviewMoves?.length ?? 0,
        total: game.moves.length,
        error: null,
      });
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      this.mutableState.update((state) => ({
        ...state,
        phase: cancelled ? 'partial' : 'error',
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
    this.mutableAnalysis.set(null);
    this.mutableState.set(INITIAL_STATE);
  }
}

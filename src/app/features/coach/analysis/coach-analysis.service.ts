import { Injectable, inject, signal } from '@angular/core';
import { ANALYSIS_ENGINE_PORT } from '../../../core/engine/analysis-engine.types';
import type { ChessColor } from '../../../shared/chess/chess.types';
import { CoachRepositoryService } from '../data/coach-repository.service';
import type { GameAnalysis, ImportedGame, MoveAnalysis } from '../domain/coach.types';
import {
  ANALYSIS_DEPTH,
  ANALYSIS_ENGINE_VERSION,
  ANALYSIS_SCHEMA_VERSION,
} from './analysis.constants';
import {
  analysisFingerprint,
  categorizeMistake,
  classifyMove,
  moveToSan,
  moveToUci,
} from './analysis-rules';

export type AnalysisPhase = 'idle' | 'ready' | 'running' | 'partial' | 'complete' | 'error';

export interface AnalysisViewState {
  phase: AnalysisPhase;
  completed: number;
  total: number;
  error: string | null;
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
  private readonly mutableAnalysis = signal<GameAnalysis | null>(null);
  private readonly mutableState = signal<AnalysisViewState>(INITIAL_STATE);
  private abortController: AbortController | null = null;

  readonly analysis = this.mutableAnalysis.asReadonly();
  readonly state = this.mutableState.asReadonly();

  async load(game: ImportedGame, learnerColor: ChessColor): Promise<void> {
    const [cached, fingerprint] = await Promise.all([
      this.repository.analysis(game.key),
      analysisFingerprint(game, learnerColor),
    ]);
    const analysis = cached?.sourceFingerprint === fingerprint ? cached : null;
    this.mutableAnalysis.set(analysis);
    this.mutableState.set({
      phase: analysis?.status === 'complete' ? 'complete' : analysis ? 'partial' : 'ready',
      completed: analysis?.moves.length ?? 0,
      total: game.moves.filter((move) => move.color === learnerColor).length,
      error: null,
    });
  }

  async analyze(game: ImportedGame, learnerColor: ChessColor): Promise<void> {
    if (this.abortController) return;
    const fingerprint = await analysisFingerprint(game, learnerColor);
    const userMoves = game.moves.filter((move) => move.color === learnerColor);
    const cached = this.mutableAnalysis();
    let analysis =
      cached?.sourceFingerprint === fingerprint
        ? cached
        : this.newAnalysis(game, learnerColor, fingerprint, userMoves.length);
    this.mutableAnalysis.set(analysis);
    this.abortController = new AbortController();
    this.mutableState.set({
      phase: 'running',
      completed: analysis.moves.length,
      total: userMoves.length,
      error: null,
    });

    try {
      const completedPlies = new Set(analysis.moves.map((move) => move.ply));
      for (const move of userMoves) {
        if (completedPlies.has(move.ply)) continue;
        const best = await this.engine.analyze({
          fen: move.fenBefore,
          depth: ANALYSIS_DEPTH,
          signal: this.abortController.signal,
        });
        if (!best.bestMove) throw new Error(`No best move was returned for ply ${move.ply}.`);
        const bestMove = moveToUci(best.bestMove);
        const played =
          bestMove === move.uci
            ? best
            : await this.engine.analyze({
                fen: move.fenBefore,
                depth: ANALYSIS_DEPTH,
                searchMove: move.uci,
                signal: this.abortController.signal,
              });
        const result = classifyMove(best.evaluation, played.evaluation);
        const bestMoveSan = moveToSan(move.fenBefore, best.bestMove);
        const moveAnalysis: MoveAnalysis = {
          importedGameKey: game.key,
          ply: move.ply,
          playedMove: move.uci,
          bestMove,
          bestMoveSan,
          principalVariation: best.principalVariation,
          bestEvaluation: best.evaluation,
          playedEvaluation: played.evaluation,
          ...(result.centipawnLoss === undefined ? {} : { centipawnLoss: result.centipawnLoss }),
          classification: result.classification,
          ...(result.classification === 'good'
            ? {}
            : { category: categorizeMistake(move.fenBefore, move.ply, bestMoveSan) }),
        };
        analysis = {
          ...analysis,
          moves: [...analysis.moves, moveAnalysis].sort((left, right) => left.ply - right.ply),
          status: 'partial',
          updatedAt: new Date().toISOString(),
        };
        this.mutableAnalysis.set(analysis);
        this.mutableState.update((state) => ({ ...state, completed: analysis.moves.length }));
        await this.repository.saveAnalysis(analysis);
      }

      const completedAt = new Date().toISOString();
      analysis = {
        ...analysis,
        status: 'complete',
        updatedAt: completedAt,
        completedAt,
      };
      await this.repository.saveAnalysis(analysis);
      this.mutableAnalysis.set(analysis);
      this.mutableState.set({
        phase: 'complete',
        completed: analysis.moves.length,
        total: userMoves.length,
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

  private newAnalysis(
    game: ImportedGame,
    learnerColor: ChessColor,
    sourceFingerprint: string,
    totalUserMoves: number,
  ): GameAnalysis {
    return {
      importedGameKey: game.key,
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      sourceFingerprint,
      engineVersion: ANALYSIS_ENGINE_VERSION,
      depth: ANALYSIS_DEPTH,
      learnerColor,
      status: 'partial',
      totalUserMoves,
      moves: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

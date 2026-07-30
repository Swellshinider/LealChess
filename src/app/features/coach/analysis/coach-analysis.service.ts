import { Injectable, inject, signal } from '@angular/core';
import { ANALYSIS_ENGINE_PORT } from '../../../core/engine/analysis-engine.types';
import type { ChessColor } from '../../../shared/chess/chess.types';
import { openingBookPlyCount } from './opening-index';
import { CoachRepositoryService } from '../data/coach-repository.service';
import type { GameAnalysis, ImportedGame, MoveAnalysis } from '../domain/coach.types';
import {
  ANALYSIS_DEPTH,
  ANALYSIS_ENGINE_VERSION,
  ANALYSIS_SCHEMA_VERSION,
} from './analysis.constants';
import { analysisFingerprint, categorizeMistake, moveToSan, moveToUci } from './analysis-rules';
import { assessMove, legacyClassification } from './review-classification';

export type AnalysisPhase =
  'idle' | 'ready' | 'starting' | 'running' | 'partial' | 'complete' | 'error';

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
      completed: analysis?.reviewMoves?.length ?? analysis?.moves.length ?? 0,
      total: game.moves.length,
      error: null,
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
    const fingerprint = await analysisFingerprint(game, learnerColor);
    const userMoves = game.moves.filter((move) => move.color === learnerColor);
    const reviewMoves = game.moves;
    const cached = this.mutableAnalysis();
    let analysis =
      !restart && cached?.sourceFingerprint === fingerprint
        ? cached
        : this.newAnalysis(game, learnerColor, fingerprint, userMoves.length);
    this.mutableAnalysis.set(analysis);
    if (restart) await this.repository.saveAnalysis(analysis);
    this.abortController = new AbortController();
    this.mutableState.set({
      phase: 'starting',
      completed: analysis.reviewMoves?.length ?? 0,
      total: reviewMoves.length,
      error: null,
    });

    try {
      await this.engine.initialize();
      if (this.abortController.signal.aborted) {
        throw new DOMException('Analysis cancelled.', 'AbortError');
      }
      this.mutableState.update((state) => ({ ...state, phase: 'running' }));
      const completedPlies = new Set((analysis.reviewMoves ?? []).map((move) => move.ply));
      const bookPlyLimit = openingBookPlyCount(reviewMoves.map((move) => move.fenAfter));
      for (const move of reviewMoves) {
        if (completedPlies.has(move.ply)) continue;
        const best = await this.engine.analyze({
          fen: move.fenBefore,
          depth: ANALYSIS_DEPTH,
          multiPv: 2,
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
        const result = assessMove(move, best, played, move.ply <= bookPlyLimit);
        const bestMoveSan = moveToSan(move.fenBefore, best.bestMove);
        const moveAnalysis: MoveAnalysis = {
          importedGameKey: game.key,
          ply: move.ply,
          playedMove: move.uci,
          bestMove,
          bestMoveSan,
          principalVariation: best.principalVariation,
          playedPrincipalVariation: played.principalVariation,
          bestEvaluation: best.evaluation,
          playedEvaluation: played.evaluation,
          ...(result.centipawnLoss === undefined ? {} : { centipawnLoss: result.centipawnLoss }),
          classification: legacyClassification(result.classification),
          reviewClassification: result.classification,
          ...(move.color !== learnerColor || !result.concern
            ? {}
            : { category: categorizeMistake(move.fenBefore, move.ply, bestMoveSan) }),
        };
        const nextReviewMoves = [...(analysis.reviewMoves ?? []), moveAnalysis].sort(
          (left, right) => left.ply - right.ply,
        );
        analysis = {
          ...analysis,
          moves:
            move.color === learnerColor
              ? [...analysis.moves, moveAnalysis].sort((left, right) => left.ply - right.ply)
              : analysis.moves,
          reviewMoves: nextReviewMoves,
          status: 'partial',
          updatedAt: new Date().toISOString(),
        };
        this.mutableAnalysis.set(analysis);
        this.mutableState.update((state) => ({
          ...state,
          completed: analysis.reviewMoves?.length ?? 0,
        }));
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
        completed: analysis.reviewMoves?.length ?? 0,
        total: reviewMoves.length,
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
      reviewMoves: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

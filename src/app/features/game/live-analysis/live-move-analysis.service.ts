import { Injectable, effect, inject, signal } from '@angular/core';
import { Chess, type Color, type PieceSymbol } from 'chess.js';
import { ANALYSIS_ENGINE_PORT } from '../../../core/engine/analysis-engine.types';
import type { PositionAnalysisResult } from '../../../core/engine/analysis-engine.types';
import { GameController } from '../../../core/game/game-controller.service';
import type { MoveRecord } from '../../../core/game/game.types';
import {
  classificationLabel,
  classifyLiveMove,
  type LiveMoveClassification,
} from './move-classification';
import { isOpeningPosition } from './opening-index';

export interface LiveClassificationState {
  phase: 'idle' | 'analyzing' | 'complete';
  gameId?: string;
  ply?: number;
  square?: string;
  classification?: LiveMoveClassification;
  label?: string;
}

@Injectable()
export class LiveMoveAnalysisService {
  private readonly controller = inject(GameController);
  private readonly engine = inject(ANALYSIS_ENGINE_PORT);
  private readonly mutableState = signal<LiveClassificationState>({ phase: 'idle' });
  private abortController: AbortController | null = null;
  private requestId = 0;
  private lastMoveKey = '';

  readonly state = this.mutableState.asReadonly();

  constructor() {
    effect(() => {
      const state = this.controller.state();
      const move = state.moves.at(-1);
      const key = move ? `${state.gameId}:${move.ply}` : '';
      if (
        !state.preferences.showMoveClassifications ||
        !move ||
        move.color !== state.playerColor ||
        key === this.lastMoveKey
      ) {
        if (!state.preferences.showMoveClassifications) this.cancel();
        return;
      }
      this.lastMoveKey = key;
      const book = state.moves.every((candidate) => isOpeningPosition(candidate.after));
      void this.analyze(state.gameId, move, book);
    });
  }

  destroy(): void {
    this.cancel();
    this.engine.destroy();
  }

  private async analyze(gameId: string, move: MoveRecord, book: boolean): Promise<void> {
    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    const requestId = ++this.requestId;
    this.mutableState.set({
      phase: 'analyzing',
      gameId,
      ply: move.ply,
      square: move.to,
    });

    try {
      if (book) {
        await Promise.resolve();
        this.publish(requestId, gameId, move, 'book');
        return;
      }
      const best = await this.engine.analyze({
        fen: move.before,
        depth: 14,
        multiPv: 2,
        signal: abortController.signal,
      });
      const played = await this.engine.analyze({
        fen: move.before,
        depth: 14,
        searchMove: move.lan,
        signal: abortController.signal,
      });
      const bestExpected = expectedPoints(best);
      const playedExpected = expectedPoints(played);
      const secondExpected = best.variations?.find((variation) => variation.rank === 2);
      const classification = classifyLiveMove({
        book: false,
        playedBestMove: toUci(best) === move.lan,
        bestExpectedPoints: bestExpected,
        playedExpectedPoints: playedExpected,
        ...(secondExpected
          ? {
              secondBestExpectedPoints:
                secondExpected.expectedPoints ?? evaluationExpected(secondExpected.evaluation),
            }
          : {}),
        soundSacrifice: isSacrifice(move) && bestExpected - playedExpected <= 0.02,
      });
      this.publish(requestId, gameId, move, classification);
    } catch (error) {
      if (
        !(error instanceof DOMException && error.name === 'AbortError') &&
        requestId === this.requestId
      ) {
        this.mutableState.set({ phase: 'idle' });
      }
    }
  }

  private publish(
    requestId: number,
    gameId: string,
    move: MoveRecord,
    classification: LiveMoveClassification,
  ): void {
    const current = this.controller.state();
    if (
      requestId !== this.requestId ||
      current.gameId !== gameId ||
      current.moves[move.ply - 1]?.lan !== move.lan
    ) {
      return;
    }
    this.mutableState.set({
      phase: 'complete',
      gameId,
      ply: move.ply,
      square: move.to,
      classification,
      label: classificationLabel(classification),
    });
  }

  private cancel(): void {
    this.requestId += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.mutableState.set({ phase: 'idle' });
  }
}

function expectedPoints(result: PositionAnalysisResult): number {
  return result.expectedPoints ?? evaluationExpected(result.evaluation);
}

function evaluationExpected(evaluation: PositionAnalysisResult['evaluation']): number {
  if (evaluation.score.kind === 'mate') return evaluation.score.moves > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-evaluation.score.value / 240));
}

function toUci(result: PositionAnalysisResult): string {
  const move = result.bestMove;
  return move ? `${move.from}${move.to}${move.promotion ?? ''}` : '';
}

function isSacrifice(move: MoveRecord): boolean {
  const piece = move.piece as PieceSymbol;
  if (piece === 'p' || piece === 'k') return false;
  const chess = new Chess(move.after);
  const opponent = (move.color === 'white' ? 'b' : 'w') as Color;
  const values: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  return chess
    .attackers(move.to, opponent)
    .some((square) => values[chess.get(square)?.type ?? 'k'] < values[piece]);
}

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ChessColor } from '../../../shared/chess/chess.types';
import type {
  EngineEvaluation,
  GameAnalysis,
  ImportedGame,
  MoveAnalysis,
  ReviewMoveClassification,
} from '../domain/coach.types';
import { isConcernClassification } from '../analysis/review-classification';
import type { MoveExplanation, ReviewEvaluationPoint } from './review-insights';
import { ReviewEvaluationTimelineComponent } from './review-evaluation-timeline.component';
import { ReviewMoveTreeComponent } from './review-move-tree.component';
import type {
  ReviewAnalysisSession,
  ReviewCandidateLine,
  ReviewMoveNode,
} from './review-analysis-session.types';
import type { ReviewLiveAnalysisState } from './review-live-analysis.service';
import { turnColor } from '../../../core/game/chess-move';
import type { MoveInput } from '../../../core/game/game.types';

@Component({
  selector: 'app-review-analysis-panel',
  imports: [ReviewEvaluationTimelineComponent, ReviewMoveTreeComponent],
  templateUrl: './review-analysis-panel.component.html',
  styleUrl: './review-analysis-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewAnalysisPanelComponent {
  readonly game = input.required<ImportedGame>();
  readonly analysis = input.required<GameAnalysis>();
  readonly currentPly = input.required<number>();
  readonly learnerColor = input.required<ChessColor>();
  readonly explanation = input<MoveExplanation | null>(null);
  readonly evaluations = input.required<ReviewEvaluationPoint[]>();
  readonly session = input.required<ReviewAnalysisSession>();
  readonly selectedNode = input.required<ReviewMoveNode>();
  readonly liveState = input.required<ReviewLiveAnalysisState>();
  readonly summaryRequested = output<void>();
  readonly plyRequested = output<number>();
  readonly ideaRequested = output<void>();
  readonly practiceRequested = output<number>();
  readonly nodeRequested = output<string>();
  readonly removeVariationRequested = output<string>();
  readonly retryRequested = output<void>();
  readonly candidateRequested = output<MoveInput>();

  protected readonly currentNote = computed<MoveAnalysis | undefined>(() =>
    (this.analysis().reviewMoves ?? this.analysis().moves).find(
      (move) => move.ply === this.currentPly(),
    ),
  );
  protected readonly currentMove = computed(() => this.game().moves[this.currentPly() - 1]);
  protected readonly canPractice = computed(() => {
    const note = this.currentNote();
    const move = this.currentMove();
    return (
      this.selectedNode().source === 'imported' &&
      Boolean(
        note &&
        move?.color === this.learnerColor() &&
        isConcernClassification(note.reviewClassification) &&
        note.category,
      )
    );
  });

  protected moveNumber(ply: number): string {
    return `${Math.ceil(ply / 2)}${ply % 2 === 0 ? '…' : '.'}`;
  }

  protected moveAnalysis(ply: number): MoveAnalysis | undefined {
    return (this.analysis().reviewMoves ?? this.analysis().moves).find((move) => move.ply === ply);
  }

  protected classificationLabel(classification: ReviewMoveClassification): string {
    return classification.charAt(0).toUpperCase() + classification.slice(1);
  }

  protected evaluationLabel(evaluation: EngineEvaluation): string {
    if (evaluation.score.kind === 'mate') {
      return `${evaluation.score.moves >= 0 ? '+' : '−'}M${Math.abs(evaluation.score.moves)}`;
    }
    const pawns = evaluation.score.value / 100;
    return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
  }

  protected requestPly(ply: number): void {
    this.plyRequested.emit(Math.max(0, Math.min(ply, this.game().moves.length)));
  }

  protected candidateEvaluationLabel(line: ReviewCandidateLine): string {
    const score = line.evaluation.score;
    const whiteRelative =
      turnColor(this.selectedNode().fen) === 'white'
        ? score
        : score.kind === 'mate'
          ? { kind: 'mate' as const, moves: -score.moves }
          : { kind: 'centipawn' as const, value: -score.value };
    return this.evaluationLabel({ ...line.evaluation, score: whiteRelative });
  }

  protected candidateRuleWidth(rank: number): string {
    return `${{ 1: 14, 2: 9, 3: 5 }[rank] ?? 5}px`;
  }

  protected candidateAriaLabel(line: ReviewCandidateLine): string {
    return `Play engine candidate ${line.rank}: ${line.san[0] ?? 'move'}`;
  }
}

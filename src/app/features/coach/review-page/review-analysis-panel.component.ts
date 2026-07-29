import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ChessColor } from '../../../shared/chess/chess.types';
import type {
  EngineEvaluation,
  GameAnalysis,
  ImportedGame,
  MoveAnalysis,
  ReviewMoveClassification,
} from '../domain/coach.types';
import type { MoveExplanation, ReviewEvaluationPoint } from './review-insights';
import { ReviewEvaluationTimelineComponent } from './review-evaluation-timeline.component';

@Component({
  selector: 'app-review-analysis-panel',
  imports: [ReviewEvaluationTimelineComponent],
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
  readonly summaryRequested = output<void>();
  readonly plyRequested = output<number>();
  readonly ideaRequested = output<void>();
  readonly practiceRequested = output<number>();

  protected readonly currentNote = computed<MoveAnalysis | undefined>(() =>
    (this.analysis().reviewMoves ?? this.analysis().moves).find(
      (move) => move.ply === this.currentPly(),
    ),
  );
  protected readonly currentMove = computed(() => this.game().moves[this.currentPly() - 1]);
  protected readonly canPractice = computed(() => {
    const note = this.currentNote();
    const move = this.currentMove();
    return Boolean(
      note &&
      move?.color === this.learnerColor() &&
      note.classification !== 'good' &&
      note.category,
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
}

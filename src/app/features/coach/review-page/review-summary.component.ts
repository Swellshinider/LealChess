import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { AnalysisPhase } from '../analysis/coach-analysis.service';
import type { ImportedGame, ReviewMoveClassification } from '../domain/coach.types';
import { REVIEW_CLASSIFICATIONS, type GameReviewSummary } from './review-insights';
import { ReviewEvaluationTimelineComponent } from './review-evaluation-timeline.component';

@Component({
  selector: 'app-review-summary',
  imports: [ReviewEvaluationTimelineComponent],
  templateUrl: './review-summary.component.html',
  styleUrl: './review-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewSummaryComponent {
  readonly game = input.required<ImportedGame>();
  readonly summary = input.required<GameReviewSummary>();
  readonly phase = input.required<AnalysisPhase>();
  readonly completed = input(0);
  readonly total = input(0);
  readonly error = input<string | null>(null);
  readonly stale = input(false);
  readonly analysisRequested = output<void>();
  readonly cancelRequested = output<void>();
  readonly reanalysisRequested = output<void>();
  readonly startRequested = output<void>();

  protected readonly progress = computed(() =>
    this.total() ? Math.round((this.completed() / this.total()) * 100) : 0,
  );
  protected readonly analysisActive = computed(
    () => this.phase() === 'starting' || this.phase() === 'running',
  );
  protected readonly visibleClassifications = computed(() =>
    REVIEW_CLASSIFICATIONS.filter(
      (classification) =>
        this.summary().white.counts[classification] || this.summary().black.counts[classification],
    ),
  );

  protected classificationLabel(classification: ReviewMoveClassification): string {
    return classification.charAt(0).toUpperCase() + classification.slice(1);
  }
}

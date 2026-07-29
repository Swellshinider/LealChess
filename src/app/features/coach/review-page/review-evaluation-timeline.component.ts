import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ReviewEvaluationPoint } from './review-insights';

@Component({
  selector: 'app-review-evaluation-timeline',
  templateUrl: './review-evaluation-timeline.component.html',
  styleUrl: './review-evaluation-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewEvaluationTimelineComponent {
  readonly points = input.required<ReviewEvaluationPoint[]>();
  readonly currentPly = input(0);
  readonly selectable = input(false);
  readonly plySelected = output<number>();

  protected readonly polyline = computed(() =>
    this.points()
      .map((point) => `${this.pointX(point)},${this.pointY(point)}`)
      .join(' '),
  );
  protected readonly currentPoint = computed(() =>
    this.points().find((point) => point.ply === this.currentPly()),
  );
  protected readonly accessibleLabel = computed(() => {
    const points = this.points();
    const orientation =
      'Values above the center line favor White; values below the center line favor Black.';
    if (!points.length) return `Game pulse. ${orientation} No analyzed moves yet.`;
    const last = points.at(-1)!;
    const side = last.value > 0.35 ? 'White' : last.value < -0.35 ? 'Black' : 'Neither side';
    return `Game pulse across ${points.length} moves. ${orientation} ${side} has the final advantage shown.`;
  });

  protected pointX(point: ReviewEvaluationPoint): number {
    const maximum = Math.max(this.points().at(-1)?.ply ?? 1, 1);
    return (point.ply / maximum) * 100;
  }

  protected pointY(point: ReviewEvaluationPoint): number {
    return 22 - point.value * 1.8;
  }

  protected select(point: ReviewEvaluationPoint): void {
    if (this.selectable()) this.plySelected.emit(point.ply);
  }
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RatingSeries } from '../learn-page.utils';

interface PlottedPoint {
  x: number;
  y: number;
  rating: number;
  dateLabel: string;
}

interface PlottedSeries extends RatingSeries {
  path: string;
  plottedPoints: PlottedPoint[];
}

interface RatingChart {
  series: PlottedSeries[];
  ticks: Array<{ value: number; y: number }>;
  firstDate: string;
  lastDate: string;
}

const CHART = {
  width: 720,
  height: 270,
  left: 54,
  right: 18,
  top: 20,
  bottom: 36,
};

@Component({
  selector: 'app-rating-trend',
  templateUrl: './rating-trend.component.html',
  styleUrl: './rating-trend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatingTrendComponent {
  readonly series = input.required<readonly RatingSeries[]>();
  protected readonly chart = computed(() => buildChart(this.series()));
  protected readonly ariaLabel = computed(() => {
    const descriptions = this.series().map((series) => {
      const direction = series.change > 0 ? 'rose' : series.change < 0 ? 'fell' : 'held steady';
      const change = series.change === 0 ? '' : ` by ${Math.abs(series.change)} points`;
      return `${series.label} ${direction}${change}, from ${series.firstRating} to ${series.latestRating}`;
    });
    return descriptions.length
      ? `Rating across imported games. ${descriptions.join('. ')}.`
      : 'No imported game ratings are available yet.';
  });

  protected changeLabel(change: number): string {
    return change > 0 ? `+${change}` : `${change}`;
  }
}

function buildChart(series: readonly RatingSeries[]): RatingChart {
  const allPoints = series.flatMap((candidate) => candidate.points);
  if (!allPoints.length) {
    return { series: [], ticks: [], firstDate: '', lastDate: '' };
  }

  const ratings = allPoints.map((point) => point.rating);
  const timestamps = allPoints.map((point) => point.timestamp);
  const rawMinimum = Math.min(...ratings);
  const rawMaximum = Math.max(...ratings);
  const ratingPadding = Math.max(10, Math.ceil((rawMaximum - rawMinimum) * 0.12));
  const minimum = rawMinimum - ratingPadding;
  const maximum = rawMaximum + ratingPadding;
  const firstTimestamp = Math.min(...timestamps);
  const lastTimestamp = Math.max(...timestamps);
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const xFor = (timestamp: number): number =>
    firstTimestamp === lastTimestamp
      ? CHART.left + plotWidth / 2
      : CHART.left + ((timestamp - firstTimestamp) / (lastTimestamp - firstTimestamp)) * plotWidth;
  const yFor = (rating: number): number =>
    CHART.top + ((maximum - rating) / (maximum - minimum)) * plotHeight;
  const plottedSeries = series.map((candidate): PlottedSeries => {
    const plottedPoints = candidate.points.map((point) => ({
      x: xFor(point.timestamp),
      y: yFor(point.rating),
      rating: point.rating,
      dateLabel: formatDate(point.date),
    }));
    return {
      ...candidate,
      plottedPoints,
      path: plottedPoints
        .map(
          (point, index) =>
            `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
        )
        .join(' '),
    };
  });
  const ticks = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const value = Math.round((maximum - (maximum - minimum) * ratio) / 10) * 10;
    return {
      value,
      y: yFor(value),
    };
  });

  return {
    series: plottedSeries,
    ticks,
    firstDate: formatDate(new Date(firstTimestamp).toISOString()),
    lastDate: formatDate(new Date(lastTimestamp).toISOString()),
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

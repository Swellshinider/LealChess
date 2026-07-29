import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReviewEvaluationPoint } from './review-insights';
import { ReviewEvaluationTimelineComponent } from './review-evaluation-timeline.component';

describe('ReviewEvaluationTimelineComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('explains the vertical evaluation direction when no moves are analyzed', async () => {
    const host = await render([]);
    const chart = host.querySelector('svg')!;

    expect(host.textContent).toContain('White advantage ↑');
    expect(host.textContent).toContain('Black advantage ↓');
    expect(host.textContent).toContain('Equal');
    expect(chart.getAttribute('aria-label')).toContain(
      'Values above the center line favor White; values below the center line favor Black.',
    );
    expect(chart.getAttribute('aria-label')).toContain('No analyzed moves yet.');
  });

  it.each([
    [0.8, 'White has the final advantage shown.'],
    [-0.8, 'Black has the final advantage shown.'],
    [0.1, 'Neither side has the final advantage shown.'],
  ])('announces the final advantage for an evaluation of %s', async (value, expected) => {
    const host = await render([point(value)]);

    expect(host.querySelector('svg')?.getAttribute('aria-label')).toContain(expected);
  });
});

async function render(points: ReviewEvaluationPoint[]): Promise<HTMLElement> {
  await TestBed.configureTestingModule({
    imports: [ReviewEvaluationTimelineComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(ReviewEvaluationTimelineComponent);
  fixture.componentRef.setInput('points', points);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function point(value: number): ReviewEvaluationPoint {
  return {
    ply: 1,
    value,
    mate: false,
    classification: 'good',
  };
}

import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewEvaluationPoint } from './review-insights';
import { ReviewEvaluationTimelineComponent } from './review-evaluation-timeline.component';

describe('ReviewEvaluationTimelineComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('explains the vertical evaluation direction when no moves are analyzed', async () => {
    const host = await render([]);
    const chart = host.querySelector('svg')!;

    expect(host.textContent).toContain('Advantage graph');
    expect(host.querySelector('.advantage-label')).toBeNull();
    expect(host.querySelector('.equal-label')).toBeNull();
    expect(chart.getAttribute('aria-label')).toContain('Advantage graph.');
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

  it('draws a territory area, center line, filtered key markers, and current position', async () => {
    const host = await render(
      [point(0.2, 1, 'good'), point(-1.1, 2, 'mistake'), point(0.7, 3, 'great')],
      2,
    );

    expect(host.querySelector('.white-territory')?.getAttribute('d')).toMatch(/^M 0 0 .+ Z$/);
    expect(host.querySelector('.zero-line')).not.toBeNull();
    expect(
      [...host.querySelectorAll('.key-point')].map((marker) =>
        marker.getAttribute('data-classification'),
      ),
    ).toEqual(['mistake', 'great']);
    expect(host.querySelector('.current-line')?.getAttribute('x1')).toBe(String((2 / 3) * 100));
  });

  it('preserves a selectable target for every analyzed move', async () => {
    const selected = vi.fn();
    const host = await render([point(0.2, 1, 'good'), point(-1.1, 2, 'blunder')], 1, selected);

    const targets = host.querySelectorAll<HTMLButtonElement>('.timeline-targets button');
    expect(targets).toHaveLength(2);
    targets[1]?.click();
    expect(selected).toHaveBeenCalledWith(2);
  });
});

async function render(
  points: ReviewEvaluationPoint[],
  currentPly = 0,
  selected?: (ply: number) => void,
): Promise<HTMLElement> {
  await TestBed.configureTestingModule({
    imports: [ReviewEvaluationTimelineComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(ReviewEvaluationTimelineComponent);
  fixture.componentRef.setInput('points', points);
  fixture.componentRef.setInput('currentPly', currentPly);
  fixture.componentRef.setInput('selectable', Boolean(selected));
  if (selected) fixture.componentInstance.plySelected.subscribe(selected);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function point(
  value: number,
  ply = 1,
  classification: ReviewEvaluationPoint['classification'] = 'good',
): ReviewEvaluationPoint {
  return {
    ply,
    value,
    mate: false,
    classification,
  };
}

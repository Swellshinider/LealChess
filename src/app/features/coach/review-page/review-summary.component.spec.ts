import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewMoveClassification } from '../domain/coach.types';
import type { GameReviewSummary } from './review-insights';
import { REVIEW_CLASSIFICATIONS } from './review-insights';
import { ReviewSummaryComponent } from './review-summary.component';

describe('ReviewSummaryComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('offers a full reanalysis for a completed review', async () => {
    await TestBed.configureTestingModule({ imports: [ReviewSummaryComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ReviewSummaryComponent);
    const requested = vi.fn();
    fixture.componentInstance.reanalysisRequested.subscribe(requested);
    fixture.componentRef.setInput('game', game);
    fixture.componentRef.setInput('summary', summary);
    fixture.componentRef.setInput('phase', 'complete');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
      candidate.textContent?.includes('Reanalyze game'),
    );
    expect(button).toBeDefined();
    expect(host.textContent).not.toContain('Stockfish depth');

    button!.click();

    expect(requested).toHaveBeenCalledOnce();
  });

  it('hides reanalysis while an evaluation is active', async () => {
    await TestBed.configureTestingModule({ imports: [ReviewSummaryComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ReviewSummaryComponent);
    fixture.componentRef.setInput('game', game);
    fixture.componentRef.setInput('summary', summary);
    fixture.componentRef.setInput('phase', 'running');
    fixture.componentRef.setInput('completed', 1);
    fixture.componentRef.setInput('total', 2);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Reanalyze game');
  });
});

const counts = Object.fromEntries(
  REVIEW_CLASSIFICATIONS.map((classification) => [classification, 0]),
) as Record<ReviewMoveClassification, number>;
const summary: GameReviewSummary = {
  evaluations: [],
  white: { counts: { ...counts }, positive: 0, concerns: 0 },
  black: { counts: { ...counts }, positive: 0, concerns: 0 },
  takeaway: 'No major learning moments crossed the review thresholds.',
};
const game = {
  key: 'local:summary',
  platform: 'local',
  platformGameId: 'summary',
  platformUrl: '',
  pgn: '',
  variant: 'standard',
  white: { username: 'White' },
  black: { username: 'Black' },
  result: '*',
  speed: 'rapid',
  timeControl: '600',
  rated: false,
  endTime: '',
  moves: [],
  parseStatus: 'ready',
  profileKeys: [],
  firstImportedAt: '',
  lastImportedAt: '',
} as const;

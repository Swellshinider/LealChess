import { TestBed } from '@angular/core/testing';
import { Chess } from 'chess.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysis, ImportedGame } from '../domain/coach.types';
import { createReviewAnalysisSession } from './review-analysis-session';
import { ReviewAnalysisPanelComponent } from './review-analysis-panel.component';

describe('ReviewAnalysisPanelComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('places the board idea action beside the move evaluation', async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewAnalysisPanelComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReviewAnalysisPanelComponent);
    const imported = game();
    const session = createReviewAnalysisSession(imported);
    const toggled = vi.fn();
    fixture.componentInstance.ideaToggled.subscribe(toggled);
    fixture.componentRef.setInput('game', imported);
    fixture.componentRef.setInput('analysis', {
      ...analysis(imported),
      reviewMoves: [
        {
          importedGameKey: imported.key,
          ply: 1,
          playedMove: 'e2e4',
          bestMove: 'e2e4',
          bestMoveSan: 'e4',
          principalVariation: ['e2e4'],
          bestEvaluation: {
            depth: 16,
            score: { kind: 'centipawn', value: 25 },
          },
          playedEvaluation: {
            depth: 16,
            score: { kind: 'centipawn', value: 25 },
          },
          centipawnLoss: 0,
          classification: 'good',
          reviewClassification: 'best',
        },
      ],
    });
    fixture.componentRef.setInput('currentPly', 1);
    fixture.componentRef.setInput('learnerColor', 'white');
    fixture.componentRef.setInput('orientation', 'white');
    fixture.componentRef.setInput('boardTheme', 'tournament');
    fixture.componentRef.setInput('explanation', {
      classification: 'best',
      title: 'A strong move',
      body: 'This keeps the position balanced.',
    });
    fixture.componentRef.setInput('evaluations', []);
    fixture.componentRef.setInput('session', session);
    fixture.componentRef.setInput('selectedNode', session.nodes[session.rootId]);
    fixture.componentRef.setInput('liveState', {
      phase: 'idle',
      nodeId: session.rootId,
      candidates: [],
    });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const footer = host.querySelector<HTMLElement>('.coach-note-footer')!;
    const action = footer.querySelector<HTMLButtonElement>('.secondary-action')!;

    expect(host.querySelector('.analysis-scroll')?.contains(footer)).toBe(true);
    expect(footer.querySelector('.evaluation')).not.toBeNull();
    expect(action.textContent).toContain('Show idea on board');
    expect(action.getAttribute('aria-pressed')).toBe('false');

    action.click();

    expect(toggled).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('ideaVisible', true);
    fixture.detectChanges();

    expect(action.textContent).toContain('Hide idea on board');
    expect(action.getAttribute('aria-pressed')).toBe('true');
  });

  it('emits the first move when an engine candidate is clicked', async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewAnalysisPanelComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReviewAnalysisPanelComponent);
    const imported = game();
    const session = createReviewAnalysisSession(imported);
    const firstMove = { from: 'e2' as const, to: 'e4' as const };
    const requested = vi.fn();
    const previewed = vi.fn();
    fixture.componentInstance.candidateRequested.subscribe(requested);
    fixture.componentInstance.candidatePreviewed.subscribe(previewed);
    fixture.componentRef.setInput('game', imported);
    fixture.componentRef.setInput('analysis', analysis(imported));
    fixture.componentRef.setInput('currentPly', 0);
    fixture.componentRef.setInput('learnerColor', 'white');
    fixture.componentRef.setInput('orientation', 'black');
    fixture.componentRef.setInput('boardTheme', 'classic');
    fixture.componentRef.setInput('explanation', null);
    fixture.componentRef.setInput('evaluations', []);
    fixture.componentRef.setInput('session', session);
    fixture.componentRef.setInput('selectedNode', session.nodes[session.rootId]);
    fixture.componentRef.setInput('liveState', {
      phase: 'complete',
      nodeId: session.rootId,
      depth: 16,
      candidates: [
        {
          rank: 1,
          evaluation: { depth: 16, score: { kind: 'centipawn', value: 36 } },
          firstMove,
          san: ['e4', 'e5'],
        },
      ],
    });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const candidate = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Play engine candidate 1: e4"]',
    )!;
    candidate.dispatchEvent(new Event('pointerenter'));
    candidate.dispatchEvent(new Event('pointerleave'));
    candidate.focus();
    candidate.blur();
    candidate.click();

    expect(requested).toHaveBeenCalledWith(firstMove);
    expect(previewed.mock.calls).toEqual([
      [expect.objectContaining({ rank: 1, firstMove })],
      [null],
      [expect.objectContaining({ rank: 1, firstMove })],
      [null],
      [null],
    ]);
  });
});

function analysis(gameValue: ImportedGame): GameAnalysis {
  return {
    importedGameKey: gameValue.key,
    schemaVersion: 1,
    sourceFingerprint: '',
    engineVersion: '',
    depth: 16,
    learnerColor: 'white',
    status: 'complete',
    totalUserMoves: 0,
    moves: [],
    reviewMoves: [],
    updatedAt: '',
  };
}

function game(): ImportedGame {
  const chess = new Chess();
  const move = chess.move('e4');
  return {
    key: 'local:review-panel',
    platform: 'local',
    platformGameId: 'review-panel',
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
    moves: [
      {
        ply: 1,
        color: 'white',
        san: move.san,
        from: move.from,
        to: move.to,
        uci: `${move.from}${move.to}`,
        fenBefore: move.before,
        fenAfter: move.after,
      },
    ],
    parseStatus: 'ready',
    profileKeys: [],
    firstImportedAt: '',
    lastImportedAt: '',
  };
}

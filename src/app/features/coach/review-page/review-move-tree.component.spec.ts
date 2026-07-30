import { TestBed } from '@angular/core/testing';
import { Chess } from 'chess.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportedGame } from '../domain/coach.types';
import {
  commitReviewMove,
  createReviewAnalysisSession,
  selectReviewNode,
} from './review-analysis-session';
import { ReviewMoveTreeComponent } from './review-move-tree.component';

describe('ReviewMoveTreeComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('groups a branch continuation into one wrapping variation line', async () => {
    const fixture = await renderTree(branchSession());
    const host = fixture.nativeElement as HTMLElement;
    const lines = host.querySelectorAll<HTMLElement>('.variation-row');

    expect(lines).toHaveLength(1);
    expect(
      [...lines[0]!.querySelectorAll<HTMLButtonElement>('.variation-move .move')].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(['c5', 'Nf3']);
  });

  it('renders sibling continuations as nested variation lines', async () => {
    let session = branchSession();
    const c5 = Object.values(session.nodes).find((node) => node.san === 'c5')!;
    session = selectReviewNode(session, c5.id);
    session = commitReviewMove(session, { from: 'd2', to: 'd4' }).session;

    const fixture = await renderTree(session);
    const host = fixture.nativeElement as HTMLElement;
    const lines = host.querySelectorAll<HTMLElement>('.variation-row');

    expect(lines).toHaveLength(2);
    expect(lines[1]!.style.getPropertyValue('--variation-depth')).toBe('2');
    expect(lines[1]!.textContent).toContain('d4');
  });

  it('keeps removal attached to the selected move within an inline line', async () => {
    const fixture = await renderTree(branchSession());
    const removed = vi.fn();
    fixture.componentInstance.removeRequested.subscribe(removed);
    const host = fixture.nativeElement as HTMLElement;
    const removeButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove this variation and all continuations"]',
    )!;

    expect(removeButton.textContent?.trim()).toBe('x');
    removeButton.click();

    expect(removed).toHaveBeenCalledWith(
      Object.values(fixture.componentInstance.session().nodes).find(
        (node) => node.san === 'Nf3' && node.source === 'manual',
      )!.id,
    );
  });
});

async function renderTree(session: ReturnType<typeof createReviewAnalysisSession>) {
  await TestBed.configureTestingModule({ imports: [ReviewMoveTreeComponent] }).compileComponents();
  const fixture = TestBed.createComponent(ReviewMoveTreeComponent);
  fixture.componentRef.setInput('session', session);
  fixture.componentRef.setInput('analysis', null);
  fixture.detectChanges();
  return fixture;
}

function branchSession(): ReturnType<typeof createReviewAnalysisSession> {
  let session = createReviewAnalysisSession(game());
  const e4 = Object.values(session.nodes).find((node) => node.san === 'e4')!;
  session = selectReviewNode(session, e4.id);
  session = commitReviewMove(session, { from: 'c7', to: 'c5' }).session;
  return commitReviewMove(session, { from: 'g1', to: 'f3' }).session;
}

function game(): ImportedGame {
  const chess = new Chess();
  const moves = ['e4', 'e5', 'Nf3'].map((san, index) => {
    const move = chess.move(san);
    return {
      ply: index + 1,
      color: move.color === 'w' ? ('white' as const) : ('black' as const),
      san: move.san,
      from: move.from,
      to: move.to,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      fenBefore: move.before,
      fenAfter: move.after,
    };
  });
  return {
    key: 'local:review-tree',
    platform: 'local',
    platformGameId: 'review-tree',
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
    moves,
    parseStatus: 'ready',
    profileKeys: [],
    firstImportedAt: '',
    lastImportedAt: '',
  };
}

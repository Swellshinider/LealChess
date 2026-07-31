import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameResult } from '../../../core/game/game.types';
import { GameOverDialogComponent } from './game-over-dialog.component';

describe('GameOverDialogComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each([
    { winner: 'white', reason: 'checkmate', label: 'White wins by checkmate' },
    { winner: 'black', reason: 'resignation', label: 'You resigned' },
    { winner: null, reason: 'stalemate', label: 'Draw by stalemate' },
  ] satisfies readonly GameResult[])('renders the result label for %s', async (result) => {
    const { host } = await render(result);

    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(host.querySelector('.result-label')?.textContent).toContain(result.label);
    expect(host.querySelector('.primary-action')?.hasAttribute('data-modal-initial')).toBe(true);
  });

  it('dismisses when Escape is pressed anywhere in the document', async () => {
    const { fixture } = await render();
    const dismissed = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dismissed).toHaveBeenCalledOnce();
  });

  it('emits dismissal, new-game, and review actions', async () => {
    const { fixture, host } = await render();
    const dismissed = vi.fn();
    const newGame = vi.fn();
    const review = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);
    fixture.componentInstance.newGameRequested.subscribe(newGame);
    fixture.componentInstance.reviewRequested.subscribe(review);

    button(host, 'Close game over dialog').click();
    button(host, 'New game').click();
    button(host, 'Review game').click();

    expect(dismissed).toHaveBeenCalledOnce();
    expect(newGame).toHaveBeenCalledOnce();
    expect(review).toHaveBeenCalledOnce();
  });

  it('confirms restart and returns focus intent to Restart when cancelled', async () => {
    const { fixture, host } = await render();
    const restarted = vi.fn();
    fixture.componentInstance.restartRequested.subscribe(restarted);

    button(host, 'Restart').click();
    fixture.detectChanges();
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();

    button(host, 'Keep result').click();
    fixture.detectChanges();
    expect(button(host, 'Restart').hasAttribute('data-modal-initial')).toBe(true);

    button(host, 'Restart').click();
    fixture.detectChanges();
    button(host, 'Restart game').click();
    expect(restarted).toHaveBeenCalledOnce();
  });

  it('shows review progress and an actionable error', async () => {
    const { fixture, host } = await render();
    fixture.componentRef.setInput('reviewPending', true);
    fixture.componentRef.setInput('reviewError', 'The game could not be saved for review.');
    fixture.detectChanges();

    expect(button(host, 'Opening review…').disabled).toBe(true);
    expect(button(host, 'New game').disabled).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'The game could not be saved for review.',
    );
  });
});

async function render(
  result: GameResult = {
    winner: 'white',
    reason: 'checkmate',
    label: 'White wins by checkmate',
  },
) {
  await TestBed.configureTestingModule({ imports: [GameOverDialogComponent] }).compileComponents();
  const fixture = TestBed.createComponent(GameOverDialogComponent);
  fixture.componentRef.setInput('result', result);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

function button(host: HTMLElement, name: string): HTMLButtonElement {
  const match = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) =>
      candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name,
  );
  if (!match) throw new Error(`Button ${name} was not found.`);
  return match;
}

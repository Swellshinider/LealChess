import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewGameDialogComponent } from './new-game-dialog.component';

describe('NewGameDialogComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('always offers close and Escape dismissal', async () => {
    const { fixture, host } = await render();
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    expect(host.querySelector('[aria-label="Close new game dialog"]')).not.toBeNull();
    host
      .querySelector('section')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('exposes rating stops through an accessible native slider and starts at that rating', async () => {
    const { fixture, host } = await render(2200);
    const started = vi.fn();
    fixture.componentInstance.started.subscribe(started);
    const slider = host.querySelector<HTMLInputElement>('#new-bot-rating')!;

    expect(slider.type).toBe('range');
    expect(slider.getAttribute('aria-valuetext')).toBe('2200 Elo');
    slider.value = '19';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(slider.getAttribute('aria-valuetext')).toBe('3190 Elo');

    host.querySelector<HTMLButtonElement>('.start')?.click();
    expect(started).toHaveBeenCalledWith({ colorSelection: 'random', botRating: 3190 });
  });
});

async function render(defaultBotRating = 1320) {
  await TestBed.configureTestingModule({ imports: [NewGameDialogComponent] }).compileComponents();
  const fixture = TestBed.createComponent(NewGameDialogComponent);
  fixture.componentRef.setInput('open', true);
  fixture.componentRef.setInput('defaultBotRating', defaultBotRating);
  fixture.componentRef.setInput('engineStatus', 'ready');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

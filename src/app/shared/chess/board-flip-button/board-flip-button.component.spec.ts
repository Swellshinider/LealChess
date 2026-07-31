import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardFlipButtonComponent } from './board-flip-button.component';

describe('BoardFlipButtonComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('exposes an accessible icon button and emits flip requests', async () => {
    await TestBed.configureTestingModule({
      imports: [BoardFlipButtonComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(BoardFlipButtonComponent);
    const emitted = vi.fn();
    fixture.componentInstance.flipRequested.subscribe(emitted);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const button = host.querySelector<HTMLButtonElement>('button')!;
    const icon = button.querySelector('svg')!;

    expect(button.getAttribute('aria-label')).toBe('Flip board');
    expect(button.getAttribute('title')).toBe('Flip board');
    expect(icon.getAttribute('aria-hidden')).toBe('true');

    button.click();

    expect(emitted).toHaveBeenCalledOnce();
  });
});

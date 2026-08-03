import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewReplayControlsComponent } from './review-replay-controls.component';

describe('ReviewReplayControlsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('labels the controls and disables the starting boundary', async () => {
    const fixture = await createFixture(0, 4);
    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ];

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'First',
      'Previous',
      'Next',
      'Last',
    ]);
    expect(buttons.map((button) => button.disabled)).toEqual([true, true, false, false]);
  });

  it('disables the ending boundary', async () => {
    const fixture = await createFixture(4, 4);
    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ];

    expect(buttons.map((button) => button.disabled)).toEqual([false, false, true, true]);
  });

  it('emits each requested destination', async () => {
    const fixture = await createFixture(2, 4);
    const requested = vi.fn();
    fixture.componentInstance.plyRequested.subscribe(requested);
    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ];

    for (const button of buttons) button.click();

    expect(requested.mock.calls.map(([ply]) => ply)).toEqual([0, 1, 3, 4]);
  });

  it('clamps requested destinations to the game bounds', async () => {
    const fixture = await createFixture(2, 4);
    const requested = vi.fn();
    fixture.componentInstance.plyRequested.subscribe(requested);
    const component = fixture.componentInstance as unknown as {
      requestPly(ply: number): void;
    };

    component.requestPly(-5);
    component.requestPly(9);

    expect(requested.mock.calls.map(([ply]) => ply)).toEqual([0, 4]);
  });
});

async function createFixture(currentPly: number, totalPlies: number) {
  await TestBed.configureTestingModule({
    imports: [ReviewReplayControlsComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(ReviewReplayControlsComponent);
  fixture.componentRef.setInput('currentPly', currentPly);
  fixture.componentRef.setInput('totalPlies', totalPlies);
  fixture.detectChanges();
  return fixture;
}

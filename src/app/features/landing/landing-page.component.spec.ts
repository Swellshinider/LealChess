import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { LandingPageComponent } from './landing-page.component';

describe('LandingPageComponent', () => {
  const start = vi.fn();

  beforeEach(async () => {
    start.mockReset();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    await TestBed.configureTestingModule({
      imports: [LandingPageComponent],
      providers: [provideRouter([]), { provide: OnboardingService, useValue: { start } }],
    }).compileComponents();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('starts onboarding only when the visitor chooses the guided tour', () => {
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();

    expect(start).not.toHaveBeenCalled();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.tour-action',
    )!;
    expect(button.textContent?.trim()).toBe('Take the guided tour');

    button.click();
    expect(start).toHaveBeenCalledOnce();
  });

  it('prerenders the home page without initializing a browser chessboard', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const fixture = TestBed.createComponent(LandingPageComponent);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect((fixture.nativeElement as HTMLElement).querySelector('cg-board')).toBeNull();
  });
});

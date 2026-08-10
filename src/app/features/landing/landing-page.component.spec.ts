import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { LandingPageComponent } from './landing-page.component';

describe('LandingPageComponent', () => {
  const start = vi.fn();

  beforeEach(async () => {
    start.mockReset();
    await TestBed.configureTestingModule({
      imports: [LandingPageComponent],
      providers: [provideRouter([]), { provide: OnboardingService, useValue: { start } }],
    }).compileComponents();
  });

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
});

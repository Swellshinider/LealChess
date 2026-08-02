import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingService, onboardingIsComplete } from '../../core/onboarding/onboarding.service';
import { OnboardingTourComponent, positionCoachmark } from './onboarding-tour.component';

class RouterStub {
  readonly events = new Subject<NavigationEnd>();
  readonly navigateByUrl = vi.fn(async (url: string) => {
    this.url = url;
    this.events.next(new NavigationEnd(1, url, url));
    return true;
  });
  url = '/';
}

describe('OnboardingTourComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [OnboardingTourComponent],
      providers: [{ provide: Router, useClass: RouterStub }],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shows routed progress and the final Learn destination', async () => {
    const service = TestBed.inject(OnboardingService);
    service.start();
    await Promise.resolve();
    const fixture = TestBed.createComponent(OnboardingTourComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('1');
    expect(host.querySelector('.step-count')?.textContent).toContain('1 / 5');

    service.goTo(4);
    await Promise.resolve();
    fixture.detectChanges();
    const next = host.querySelector<HTMLButtonElement>('.next-action')!;
    expect(next.textContent).toContain('Finish on Learn');

    service.finish();
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(onboardingIsComplete()).toBe(true);
  });

  it('dismisses with Escape and persists the choice', async () => {
    const service = TestBed.inject(OnboardingService);
    service.start();
    await Promise.resolve();
    const fixture = TestBed.createComponent(OnboardingTourComponent);
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(service.active()).toBe(false);
    expect(onboardingIsComplete()).toBe(true);
  });
});

describe('positionCoachmark', () => {
  const target = { top: 80, right: 520, bottom: 380, left: 120, width: 400, height: 300 };

  it('uses a bottom sheet on narrow screens', () => {
    expect(positionCoachmark(target, 390, 844)).toEqual({ placement: 'mobile' });
  });

  it('prefers open space beside the target', () => {
    expect(positionCoachmark(target, 1200, 800).placement).toBe('right');
  });
});

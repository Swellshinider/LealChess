import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ONBOARDING_COMPLETION_KEY,
  ONBOARDING_COMPLETION_VERSION,
  OnboardingService,
  clearOnboardingCompletion,
  onboardingIsComplete,
  writeOnboardingCompletion,
} from './onboarding.service';

class RouterStub {
  readonly events = new Subject<NavigationEnd>();
  readonly navigateByUrl = vi.fn(async (url: string) => {
    this.url = url;
    this.events.next(new NavigationEnd(1, url, url));
    return true;
  });
  url = '/';
}

describe('onboarding storage', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('accepts only the current completion version', () => {
    localStorage.setItem(ONBOARDING_COMPLETION_KEY, '1');
    expect(onboardingIsComplete()).toBe(false);

    writeOnboardingCompletion();
    expect(localStorage.getItem(ONBOARDING_COMPLETION_KEY)).toBe(ONBOARDING_COMPLETION_VERSION);
    expect(onboardingIsComplete()).toBe(true);

    clearOnboardingCompletion();
    expect(onboardingIsComplete()).toBe(false);
  });

  it('fails safely when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });

    expect(onboardingIsComplete()).toBe(false);
    expect(() => writeOnboardingCompletion()).not.toThrow();
    expect(() => clearOnboardingCompletion()).not.toThrow();
  });
});

describe('OnboardingService', () => {
  let router: RouterStub;

  beforeEach(() => {
    localStorage.clear();
    history.replaceState({}, '', '/');
    router = new RouterStub();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('starts from Home and navigates through the routed stops', async () => {
    const service = TestBed.inject(OnboardingService);

    service.initialize();
    expect(service.active()).toBe(true);
    expect(service.currentStep()).toBe(0);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/play');
    await Promise.resolve();

    service.back();
    expect(service.currentStep()).toBe(0);
    service.next();
    await Promise.resolve();
    expect(service.currentStep()).toBe(1);
    expect(router.navigateByUrl).toHaveBeenLastCalledWith('/settings');
  });

  it('does not interrupt a direct link or a completed visitor', () => {
    router.url = '/learn';
    history.replaceState({}, '', '/learn');
    const directService = TestBed.inject(OnboardingService);
    directService.initialize();
    expect(directService.active()).toBe(false);

    TestBed.resetTestingModule();
    writeOnboardingCompletion();
    history.replaceState({}, '', '/');
    router = new RouterStub();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    const completedService = TestBed.inject(OnboardingService);
    completedService.initialize();
    expect(completedService.active()).toBe(false);
  });

  it('persists skipping and can replay from the beginning', async () => {
    const service = TestBed.inject(OnboardingService);
    service.start();
    await Promise.resolve();
    service.next();
    await Promise.resolve();
    service.skip();

    expect(service.active()).toBe(false);
    expect(onboardingIsComplete()).toBe(true);

    service.start();
    expect(service.active()).toBe(true);
    expect(service.currentStep()).toBe(0);
  });

  it('finishes on Learn and clears completion independently', async () => {
    const service = TestBed.inject(OnboardingService);
    service.start();
    await Promise.resolve();
    service.goTo(4);
    await Promise.resolve();
    service.next();

    expect(service.active()).toBe(false);
    expect(onboardingIsComplete()).toBe(true);
    expect(router.navigateByUrl).toHaveBeenLastCalledWith('/learn');

    service.clearCompletion();
    expect(onboardingIsComplete()).toBe(false);
  });

  it('prefers the first registered anchor candidate and falls back when it leaves', async () => {
    const service = TestBed.inject(OnboardingService);
    const workspace = document.createElement('main');
    const setup = document.createElement('section');
    document.body.append(workspace, setup);
    const unregisterWorkspace = service.registerAnchor('play-workspace', workspace);
    const unregisterSetup = service.registerAnchor('play-setup', setup);

    service.start();
    await Promise.resolve();
    expect(service.activeAnchor()).toBe(setup);

    unregisterSetup();
    setup.remove();
    expect(service.activeAnchor()).toBe(workspace);

    unregisterWorkspace();
    workspace.remove();
  });
});

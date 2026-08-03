import { Injectable, afterNextRender, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

export const ONBOARDING_COMPLETION_KEY = 'lealchess.onboarding.completed';
export const ONBOARDING_COMPLETION_VERSION = '3';

export interface OnboardingStep {
  readonly id: string;
  readonly route: string;
  readonly anchors: readonly string[];
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly hint: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'play',
    route: '/play',
    anchors: ['play-setup', 'play-workspace'],
    eyebrow: 'Play',
    title: 'Set the board, then make the first plan',
    description:
      'Choose your color and Stockfish strength here. You can try the controls now or continue without starting a game.',
    hint: 'Stockfish runs entirely on this device.',
  },
  {
    id: 'learn-import',
    route: '/learn',
    anchors: ['learn-import'],
    eyebrow: 'Learn · imports',
    title: 'Bring your games to the study desk',
    description:
      'Enter a Chess.com username, a Lichess username, or both. Games are fetched only when you choose Import games.',
    hint: 'Imports and account preferences stay in this browser.',
  },
  {
    id: 'learn-overview',
    route: '/learn',
    anchors: ['learn-overview'],
    eyebrow: 'Learn · overview',
    title: 'See the patterns across your play',
    description:
      'Your results, rating trend, openings, and recurring study priorities come together in this overview.',
    hint: 'The summary is generated locally from your games.',
  },
  {
    id: 'learn-games',
    route: '/learn',
    anchors: ['learn-games'],
    eyebrow: 'Learn · game archive',
    title: 'Turn each game into a lesson',
    description:
      'Imported and LealChess games appear here. Filter the archive, open a review, and practice better continuations.',
    hint: 'No games yet? Open the import panel above whenever you are ready.',
  },
  {
    id: 'explorer',
    route: '/explorer',
    anchors: ['explorer-workspace'],
    eyebrow: 'Explorer',
    title: 'Follow the position beyond the game',
    description:
      'Move either color, build a position, or import FEN and PGN. Variations stay together while local analysis compares your ideas.',
    hint: 'Try the board—the tour will not change your saved games.',
  },
] as const;

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly router = inject(Router);
  private readonly anchors = new Map<string, Set<HTMLElement>>();
  private browserReady = false;
  private completedInMemory = false;
  private expectedRoute: string | null = null;
  private navigationTicket = 0;

  readonly active = signal(false);
  readonly currentStep = signal(0);
  readonly activeAnchor = signal<HTMLElement | null>(null);
  readonly transitioning = signal(false);
  readonly step = computed(() => ONBOARDING_STEPS[this.currentStep()] ?? ONBOARDING_STEPS[0]!);
  readonly finalStep = computed(() => this.currentStep() === ONBOARDING_STEP_COUNT - 1);

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const route = routePath(event.urlAfterRedirects);
        if (!this.active()) {
          if (
            this.browserReady &&
            !this.completedInMemory &&
            route === '/' &&
            !onboardingIsComplete()
          ) {
            this.start();
          }
          return;
        }
        if (route !== this.step().route && route !== this.expectedRoute) {
          this.skip();
          return;
        }
        this.expectedRoute = null;
        this.refreshAnchor();
      });
    afterNextRender(() => {
      this.browserReady = true;
      this.initialize();
    });
  }

  initialize(): void {
    if (
      !this.completedInMemory &&
      browserPath(this.router.url) === '/' &&
      !onboardingIsComplete()
    ) {
      this.start();
    }
  }

  start(): void {
    if (this.transitioning()) return;
    this.currentStep.set(0);
    this.active.set(true);
    void this.openCurrentStep();
  }

  next(): void {
    if (this.transitioning()) return;
    if (this.finalStep()) {
      this.finish();
      return;
    }
    this.currentStep.update((step) => step + 1);
    void this.openCurrentStep();
  }

  back(): void {
    if (this.transitioning() || this.currentStep() === 0) return;
    this.currentStep.update((step) => step - 1);
    void this.openCurrentStep();
  }

  goTo(step: number): void {
    if (
      this.transitioning() ||
      step < 0 ||
      step >= ONBOARDING_STEP_COUNT ||
      step === this.currentStep()
    )
      return;
    this.currentStep.set(step);
    void this.openCurrentStep();
  }

  skip(): void {
    this.complete();
  }

  finish(): void {
    this.complete();
    void this.router.navigateByUrl('/learn');
  }

  clearCompletion(): void {
    this.completedInMemory = false;
    this.expectedRoute = null;
    this.navigationTicket += 1;
    this.transitioning.set(false);
    this.active.set(false);
    this.activeAnchor.set(null);
    clearOnboardingCompletion();
  }

  registerAnchor(id: string, element: HTMLElement): () => void {
    const registered = this.anchors.get(id) ?? new Set<HTMLElement>();
    registered.add(element);
    this.anchors.set(id, registered);
    this.refreshAnchor();
    return () => {
      registered.delete(element);
      if (!registered.size) this.anchors.delete(id);
      if (this.activeAnchor() === element) this.refreshAnchor();
    };
  }

  private async openCurrentStep(): Promise<void> {
    this.activeAnchor.set(null);
    const route = this.step().route;
    if (routePath(this.router.url) !== route) {
      const ticket = ++this.navigationTicket;
      this.transitioning.set(true);
      this.expectedRoute = route;
      const navigated = await this.router.navigateByUrl(route);
      if (ticket === this.navigationTicket) this.transitioning.set(false);
      if (!navigated && this.active() && ticket === this.navigationTicket) this.skip();
      return;
    }
    this.refreshAnchor();
  }

  private refreshAnchor(): void {
    if (!this.active()) {
      this.activeAnchor.set(null);
      return;
    }
    for (const id of this.step().anchors) {
      const match = [...(this.anchors.get(id) ?? [])].find((element) => element.isConnected);
      if (match) {
        this.activeAnchor.set(match);
        return;
      }
    }
    this.activeAnchor.set(null);
  }

  private complete(): void {
    this.completedInMemory = true;
    this.expectedRoute = null;
    this.navigationTicket += 1;
    this.transitioning.set(false);
    this.active.set(false);
    this.activeAnchor.set(null);
    writeOnboardingCompletion();
  }
}

export function onboardingIsComplete(storage = browserStorage()): boolean {
  try {
    return storage?.getItem(ONBOARDING_COMPLETION_KEY) === ONBOARDING_COMPLETION_VERSION;
  } catch {
    return false;
  }
}

export function writeOnboardingCompletion(storage = browserStorage()): void {
  try {
    storage?.setItem(ONBOARDING_COMPLETION_KEY, ONBOARDING_COMPLETION_VERSION);
  } catch {
    // The completed state still lasts for the current application session.
  }
}

export function clearOnboardingCompletion(storage = browserStorage()): void {
  try {
    storage?.removeItem(ONBOARDING_COMPLETION_KEY);
  } catch {
    // Other local data can still be cleared when browser storage is unavailable.
  }
}

function routePath(url: string): string {
  return url.split(/[?#]/, 1)[0] || '/';
}

function browserPath(routerUrl: string): string {
  try {
    return typeof location === 'undefined' ? routePath(routerUrl) : location.pathname;
  } catch {
    return routePath(routerUrl);
  }
}

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

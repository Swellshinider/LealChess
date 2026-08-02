import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { ElementRef, OnDestroy } from '@angular/core';
import { ONBOARDING_STEPS, OnboardingService } from '../../core/onboarding/onboarding.service';

interface TourGeometry {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface CoachmarkPosition {
  readonly top?: number;
  readonly left?: number;
  readonly placement: 'left' | 'right' | 'above' | 'below' | 'mobile';
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

@Component({
  selector: 'app-onboarding-tour',
  templateUrl: './onboarding-tour.component.html',
  styleUrl: './onboarding-tour.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingTourComponent implements OnDestroy {
  protected readonly onboarding = inject(OnboardingService);
  protected readonly steps = ONBOARDING_STEPS;
  protected readonly geometry = signal<TourGeometry | null>(null);
  protected readonly coachmarkPosition = signal<CoachmarkPosition>({ placement: 'mobile' });
  private readonly heading = viewChild<ElementRef<HTMLElement>>('tourHeading');
  private readonly inertStates = new Map<HTMLElement, boolean>();
  private resizeObserver: ResizeObserver | null = null;
  private geometryFrame: number | null = null;
  private settleFrame: number | null = null;

  constructor() {
    effect(() => {
      const active = this.onboarding.active();
      const anchor = this.onboarding.activeAnchor();
      this.restorePage();
      this.disconnectObserver();
      if (!active || !anchor) {
        this.geometry.set(null);
        return;
      }

      anchor.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
        inline: 'center',
      });
      this.isolatePageTo(anchor);
      this.resizeObserver = new ResizeObserver(() => this.scheduleGeometry());
      this.resizeObserver.observe(anchor);
      this.scheduleGeometry();
      this.settleFrame = requestAnimationFrame(() => {
        this.scheduleGeometry();
        this.heading()?.nativeElement.focus();
      });
    });
  }

  ngOnDestroy(): void {
    this.restorePage();
    this.disconnectObserver();
    if (this.geometryFrame !== null) cancelAnimationFrame(this.geometryFrame);
    if (this.settleFrame !== null) cancelAnimationFrame(this.settleFrame);
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected scheduleGeometry(): void {
    if (this.geometryFrame !== null) cancelAnimationFrame(this.geometryFrame);
    this.geometryFrame = requestAnimationFrame(() => {
      this.geometryFrame = null;
      this.updateGeometry();
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeydown(event: KeyboardEvent): void {
    if (!this.onboarding.active()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.onboarding.skip();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = this.focusableElements();
    if (!focusable.length) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.shiftKey
      ? currentIndex <= 0
        ? focusable.length - 1
        : currentIndex - 1
      : currentIndex === -1 || currentIndex === focusable.length - 1
        ? 0
        : currentIndex + 1;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  }

  protected selectStep(index: number): void {
    this.onboarding.goTo(index);
  }

  private updateGeometry(): void {
    const anchor = this.onboarding.activeAnchor();
    if (!anchor?.isConnected) {
      this.geometry.set(null);
      return;
    }
    const bounds = anchor.getBoundingClientRect();
    const padding = 8;
    const left = Math.max(8, bounds.left - padding);
    const top = Math.max(8, bounds.top - padding);
    const right = Math.min(window.innerWidth - 8, bounds.right + padding);
    const bottom = Math.min(window.innerHeight - 8, bounds.bottom + padding);
    const geometry = {
      top,
      right,
      bottom,
      left,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
    this.geometry.set(geometry);
    this.coachmarkPosition.set(positionCoachmark(geometry, window.innerWidth, window.innerHeight));
  }

  private isolatePageTo(anchor: HTMLElement): void {
    const routeHost = anchor.closest<HTMLElement>('.route-host');
    if (!routeHost) return;
    let current: HTMLElement | null = anchor;
    while (current && current !== routeHost) {
      const parent: HTMLElement | null = current.parentElement;
      if (!parent) break;
      for (const sibling of parent.children) {
        if (!(sibling instanceof HTMLElement) || sibling === current) continue;
        if (!this.inertStates.has(sibling)) this.inertStates.set(sibling, sibling.inert);
        sibling.inert = true;
      }
      current = parent;
    }
  }

  private restorePage(): void {
    for (const [element, inert] of this.inertStates) element.inert = inert;
    this.inertStates.clear();
  }

  private disconnectObserver(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  private focusableElements(): HTMLElement[] {
    const anchor = this.onboarding.activeAnchor();
    const card = this.heading()?.nativeElement.closest<HTMLElement>('.tour-card');
    return [anchor, card]
      .filter((element): element is HTMLElement => Boolean(element))
      .flatMap((element) => [...element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)])
      .filter(
        (element) =>
          element.getClientRects().length > 0 &&
          !element.closest('[inert]') &&
          element.getAttribute('aria-hidden') !== 'true',
      );
  }
}

export function positionCoachmark(
  target: TourGeometry,
  viewportWidth: number,
  viewportHeight: number,
): CoachmarkPosition {
  if (viewportWidth <= 700) return { placement: 'mobile' };
  const cardWidth = Math.min(370, viewportWidth - 32);
  const estimatedHeight = 330;
  const gap = 18;
  const clampedTop = Math.max(16, Math.min(target.top, viewportHeight - estimatedHeight - 16));
  if (viewportWidth - target.right >= cardWidth + gap) {
    return { placement: 'right', left: target.right + gap, top: clampedTop };
  }
  if (target.left >= cardWidth + gap) {
    return { placement: 'left', left: target.left - cardWidth - gap, top: clampedTop };
  }
  const left = Math.max(16, Math.min(target.left, viewportWidth - cardWidth - 16));
  if (viewportHeight - target.bottom >= estimatedHeight + gap) {
    return { placement: 'below', left, top: target.bottom + gap };
  }
  return {
    placement: 'above',
    left,
    top: Math.max(16, target.top - estimatedHeight - gap),
  };
}

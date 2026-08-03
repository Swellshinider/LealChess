import { Directive, ElementRef, inject, input } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { OnboardingService } from './onboarding.service';

@Directive({
  selector: '[appOnboardingAnchor]',
})
export class OnboardingAnchorDirective implements OnInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly onboarding = inject(OnboardingService);
  private unregister: (() => void) | null = null;

  readonly appOnboardingAnchor = input.required<string>();

  ngOnInit(): void {
    this.unregister = this.onboarding.registerAnchor(this.appOnboardingAnchor(), this.element);
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }
}

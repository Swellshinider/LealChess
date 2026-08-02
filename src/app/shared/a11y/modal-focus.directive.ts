import { Directive, ElementRef, HostListener, effect, inject, input, output } from '@angular/core';
import type { AfterViewInit, OnDestroy } from '@angular/core';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

@Directive({
  selector: '[appModalFocus]',
})
export class ModalFocusDirective implements AfterViewInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly opener =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private focusFrame: number | null = null;
  private viewReady = false;

  readonly modalCanDismiss = input(true);
  readonly modalFocusDisabled = input(false);
  readonly modalDismissed = output<void>();

  constructor() {
    effect(() => {
      const disabled = this.modalFocusDisabled();
      if (!this.viewReady) return;
      if (disabled) {
        if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
        this.focusFrame = null;
        return;
      }
      this.scheduleInitialFocus();
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (!this.modalFocusDisabled()) this.scheduleInitialFocus();
  }

  private scheduleInitialFocus(): void {
    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => {
      const initial = this.element.querySelector<HTMLElement>('[data-modal-initial]');
      (initial ?? this.focusableElements()[0] ?? this.element).focus();
      this.focusFrame = null;
    });
  }

  ngOnDestroy(): void {
    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    if (this.opener?.isConnected) {
      requestAnimationFrame(() => this.opener?.focus());
    }
  }

  @HostListener('keydown', ['$event'])
  protected handleKeydown(event: KeyboardEvent): void {
    if (this.modalFocusDisabled()) return;
    if (event.key === 'Escape' && this.modalCanDismiss()) {
      event.preventDefault();
      event.stopPropagation();
      this.modalDismissed.emit();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = this.focusableElements();
    if (!focusable.length) {
      event.preventDefault();
      this.element.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusableElements(): HTMLElement[] {
    return [...this.element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
      (element) =>
        !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
    );
  }
}

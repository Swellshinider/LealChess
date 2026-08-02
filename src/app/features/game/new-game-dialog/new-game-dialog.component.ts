import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  BOT_RATING_STOPS,
  DEFAULT_BOT_RATING,
  type BotRating,
} from '../../../core/engine/bot-rating';
import { ModalFocusDirective } from '../../../shared/a11y/modal-focus.directive';
import { OnboardingAnchorDirective } from '../../../core/onboarding/onboarding-anchor.directive';
import { OnboardingService } from '../../../core/onboarding/onboarding.service';
import type { ColorSelection, EngineStatus, StartGameOptions } from '../../../core/game/game.types';

@Component({
  selector: 'app-new-game-dialog',
  imports: [ModalFocusDirective, OnboardingAnchorDirective],
  templateUrl: './new-game-dialog.component.html',
  styleUrl: './new-game-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewGameDialogComponent {
  protected readonly onboarding = inject(OnboardingService);
  readonly open = input(false);
  readonly defaultBotRating = input<BotRating>(DEFAULT_BOT_RATING);
  readonly engineStatus = input<EngineStatus>('idle');
  readonly engineError = input<string | null>(null);
  readonly started = output<StartGameOptions>();
  readonly cancelled = output<void>();
  readonly retryRequested = output<void>();

  protected readonly color = signal<ColorSelection>('random');
  protected readonly ratingIndex = signal(0);
  protected readonly ratingStops = BOT_RATING_STOPS;
  protected readonly colors: readonly { value: ColorSelection; label: string; symbol: string }[] = [
    { value: 'white', label: 'White', symbol: '♙' },
    { value: 'random', label: 'Random', symbol: '◐' },
    { value: 'black', label: 'Black', symbol: '♟' },
  ];

  constructor() {
    effect(() => {
      if (this.open()) {
        this.ratingIndex.set(Math.max(0, this.ratingStops.indexOf(this.defaultBotRating())));
      }
    });
  }

  protected setRating(event: Event): void {
    this.ratingIndex.set(Number((event.target as HTMLInputElement).value));
  }

  protected botRating(): BotRating {
    return this.ratingStops[this.ratingIndex()] ?? DEFAULT_BOT_RATING;
  }

  protected start(): void {
    if (this.engineStatus() !== 'ready') return;
    this.started.emit({
      colorSelection: this.color(),
      botRating: this.botRating(),
    });
  }
}

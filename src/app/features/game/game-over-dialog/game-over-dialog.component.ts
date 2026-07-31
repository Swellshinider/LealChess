import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
import type { GameResult } from '../../../core/game/game.types';
import { ConfirmationDialogComponent } from '../../../shared/a11y/confirmation-dialog/confirmation-dialog.component';
import { ModalFocusDirective } from '../../../shared/a11y/modal-focus.directive';

@Component({
  selector: 'app-game-over-dialog',
  imports: [ConfirmationDialogComponent, ModalFocusDirective],
  templateUrl: './game-over-dialog.component.html',
  styleUrl: './game-over-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameOverDialogComponent {
  readonly result = input.required<GameResult>();
  readonly reviewPending = input(false);
  readonly reviewError = input<string | null>(null);
  readonly dismissed = output<void>();
  readonly newGameRequested = output<void>();
  readonly restartRequested = output<void>();
  readonly reviewRequested = output<void>();

  protected readonly restartConfirmationOpen = signal(false);
  protected readonly returnFocusToRestart = signal(false);

  @HostListener('document:keydown.escape', ['$event'])
  protected dismissOnEscape(event: Event): void {
    if (this.restartConfirmationOpen()) return;
    event.preventDefault();
    this.dismissed.emit();
  }

  protected confirmRestart(): void {
    this.returnFocusToRestart.set(false);
    this.restartConfirmationOpen.set(true);
  }

  protected cancelRestart(): void {
    this.returnFocusToRestart.set(true);
    this.restartConfirmationOpen.set(false);
  }

  protected restart(): void {
    this.restartConfirmationOpen.set(false);
    this.restartRequested.emit();
  }
}

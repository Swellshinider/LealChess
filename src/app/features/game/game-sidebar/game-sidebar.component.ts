import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { GameController } from '../../../core/game/game-controller.service';
import { ModalFocusDirective } from '../../../shared/a11y/modal-focus.directive';
import { MoveHistoryComponent } from '../move-history/move-history.component';

type Confirmation = 'restart' | 'resign' | null;

@Component({
  selector: 'app-game-sidebar',
  imports: [ModalFocusDirective, MoveHistoryComponent],
  templateUrl: './game-sidebar.component.html',
  styleUrl: './game-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameSidebarComponent {
  protected readonly controller = inject(GameController);
  readonly newGameRequested = output<Event>();
  protected readonly state = this.controller.state;
  protected readonly confirmation = signal<Confirmation>(null);
  private confirmationTrigger: HTMLElement | null = null;

  protected statusTitle(): string {
    const state = this.state();
    if (state.result) {
      return state.result.label;
    }
    if (state.engineStatus === 'error') {
      return 'Engine unavailable';
    }
    if (state.engineStatus === 'loading') {
      return 'Loading Stockfish';
    }
    if (state.engineStatus === 'thinking') {
      return 'Stockfish is thinking';
    }
    if (state.phase === 'setup') {
      return 'Ready for a game';
    }
    return state.isPlayerTurn ? 'Your move' : 'Opponent to move';
  }

  protected statusDetail(): string {
    const state = this.state();
    if (state.engineError) {
      return state.engineError;
    }
    if (state.engineStatus === 'loading') {
      return 'Preparing the engine on this device.';
    }
    if (state.result?.winner === state.playerColor) {
      return 'Well played.';
    }
    if (state.result?.winner && state.result.winner !== state.playerColor) {
      return 'Start another game when you are ready.';
    }
    if (state.result) {
      return 'The position is a draw.';
    }
    if (state.pendingPremove) {
      return `Premove ${state.pendingPremove.from}–${state.pendingPremove.to} is queued.`;
    }
    return state.isPlayerTurn ? 'Find your best continuation.' : 'You can queue one premove.';
  }

  protected showStatusDetail(): boolean {
    const state = this.state();
    return Boolean(
      state.engineError || state.result || state.pendingPremove || state.engineStatus === 'loading',
    );
  }

  protected confirm(action: Exclude<Confirmation, null>, event: Event): void {
    if (event.currentTarget instanceof HTMLElement) {
      this.confirmationTrigger = event.currentTarget;
    }
    this.confirmation.set(action);
  }

  protected closeConfirmation(): void {
    this.confirmation.set(null);
    requestAnimationFrame(() => this.confirmationTrigger?.focus());
  }

  protected runConfirmedAction(): void {
    const action = this.confirmation();
    this.confirmation.set(null);
    if (action === 'restart') {
      void this.controller.restartGame();
    } else if (action === 'resign') {
      void this.controller.resignGame();
    }
  }
}

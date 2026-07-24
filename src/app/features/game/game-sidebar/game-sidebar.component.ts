import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { DIFFICULTY_PRESETS } from '../../../core/engine/difficulty';
import { GameController } from '../../../core/game/game-controller.service';
import type { BoardTheme, DifficultyId } from '../../../core/game/game.types';
import { MoveHistoryComponent } from '../move-history/move-history.component';

type Confirmation = 'restart' | 'resign' | null;

@Component({
  selector: 'app-game-sidebar',
  imports: [MoveHistoryComponent],
  templateUrl: './game-sidebar.component.html',
  styleUrl: './game-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameSidebarComponent {
  protected readonly controller = inject(GameController);
  readonly newGameRequested = output<void>();
  protected readonly difficulties = DIFFICULTY_PRESETS;
  protected readonly state = this.controller.state;
  protected readonly confirmation = signal<Confirmation>(null);
  protected readonly settingsOpen = signal(false);

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

  protected changeDifficulty(event: Event): void {
    const difficulty = (event.target as HTMLSelectElement).value as DifficultyId;
    void this.controller.changeDifficulty(difficulty);
  }

  protected toggleSound(event: Event): void {
    this.controller.updatePreferences({
      soundEnabled: (event.target as HTMLInputElement).checked,
    });
  }

  protected toggleLegalMoves(event: Event): void {
    this.controller.updatePreferences({
      showLegalMoves: (event.target as HTMLInputElement).checked,
    });
  }

  protected togglePremoves(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.controller.updatePreferences({ premovesEnabled: enabled });
    if (!enabled) {
      this.controller.cancelPremove();
    }
  }

  protected changeTheme(event: Event): void {
    this.controller.updatePreferences({
      boardTheme: (event.target as HTMLSelectElement).value as BoardTheme,
    });
  }

  protected confirm(action: Exclude<Confirmation, null>): void {
    this.confirmation.set(action);
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

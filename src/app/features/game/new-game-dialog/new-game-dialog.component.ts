import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { DIFFICULTY_PRESETS } from '../../../core/engine/difficulty';
import type { ColorSelection, DifficultyId, StartGameOptions } from '../../../core/game/game.types';

@Component({
  selector: 'app-new-game-dialog',
  imports: [],
  templateUrl: './new-game-dialog.component.html',
  styleUrl: './new-game-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewGameDialogComponent {
  readonly open = input(false);
  readonly canClose = input(true);
  readonly defaultDifficulty = input<DifficultyId>('casual');
  readonly started = output<StartGameOptions>();
  readonly cancelled = output<void>();

  protected readonly color = signal<ColorSelection>('random');
  protected readonly difficulty = signal<DifficultyId>('casual');
  protected readonly difficulties = DIFFICULTY_PRESETS;
  protected readonly colors: readonly { value: ColorSelection; label: string; symbol: string }[] = [
    { value: 'white', label: 'White', symbol: '♙' },
    { value: 'random', label: 'Random', symbol: '◐' },
    { value: 'black', label: 'Black', symbol: '♟' },
  ];

  constructor() {
    effect(() => {
      if (this.open()) {
        this.difficulty.set(this.defaultDifficulty());
      }
    });
  }

  protected setDifficulty(event: Event): void {
    this.difficulty.set((event.target as HTMLSelectElement).value as DifficultyId);
  }

  protected start(): void {
    this.started.emit({
      colorSelection: this.color(),
      difficulty: this.difficulty(),
    });
  }
}

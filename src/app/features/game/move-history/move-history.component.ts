import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { MoveRecord } from '../../../core/game/game.types';

interface MovePair {
  number: number;
  white?: MoveRecord;
  black?: MoveRecord;
}

@Component({
  selector: 'app-move-history',
  imports: [],
  templateUrl: './move-history.component.html',
  styleUrl: './move-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoveHistoryComponent {
  readonly moves = input.required<readonly MoveRecord[]>();
  protected readonly pairs = computed<MovePair[]>(() => {
    const pairs: MovePair[] = [];
    for (const move of this.moves()) {
      const index = Math.floor((move.ply - 1) / 2);
      const pair = pairs[index] ?? { number: index + 1 };
      if (move.color === 'white') {
        pair.white = move;
      } else {
        pair.black = move;
      }
      pairs[index] = pair;
    }
    return pairs;
  });
}

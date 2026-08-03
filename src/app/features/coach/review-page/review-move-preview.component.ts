import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  viewChild,
} from '@angular/core';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import type { BoardTheme } from '../../../core/game/game.types';
import { ChessgroundBoardComponent } from '../../../shared/chess/chessground-board/chessground-board.component';
import type { ChessColor } from '../../../shared/chess/chess.types';
import type { ReviewMoveNode } from './review-analysis-session.types';

export interface ReviewMovePreviewPosition {
  left: number;
  top: number;
}

@Component({
  selector: 'app-review-move-preview',
  imports: [ChessgroundBoardComponent],
  templateUrl: './review-move-preview.component.html',
  styleUrl: './review-move-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewMovePreviewComponent {
  private readonly board = viewChild(ChessgroundBoardComponent);

  readonly node = input.required<ReviewMoveNode>();
  readonly orientation = input.required<ChessColor>();
  readonly boardTheme = input.required<BoardTheme>();
  readonly position = input.required<ReviewMovePreviewPosition>();

  protected readonly moveLabel = computed(() => {
    const node = this.node();
    const number = `${Math.ceil(node.ply / 2)}${node.color === 'black' ? '…' : '.'}`;
    return `${number} ${node.san ?? 'Position'}`;
  });

  protected readonly boardConfig = computed<Config>(() => {
    const node = this.node();
    return {
      fen: node.fen,
      orientation: this.orientation(),
      coordinates: false,
      viewOnly: true,
      animation: { enabled: false },
      lastMove: node.move
        ? ([node.move.from as Key, node.move.to as Key] as [Key, Key])
        : undefined,
      movable: { color: undefined, dests: new Map() },
      draggable: { enabled: false },
      selectable: { enabled: false },
      drawable: { enabled: false, visible: false },
    };
  });

  constructor() {
    effect(() => this.board()?.set(this.boardConfig()));
  }
}

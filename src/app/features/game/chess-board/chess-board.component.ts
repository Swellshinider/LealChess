import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { AfterViewInit } from '@angular/core';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Config } from '@lichess-org/chessground/config';
import type { Dests, Key } from '@lichess-org/chessground/types';
import type { Square } from 'chess.js';
import { GameController } from '../../../core/game/game-controller.service';
import type { MoveInput, PromotionPiece } from '../../../core/game/game.types';
import { ModalFocusDirective } from '../../../shared/a11y/modal-focus.directive';
import { ChessgroundBoardComponent } from '../../../shared/chess/chessground-board/chessground-board.component';

interface PendingPromotion {
  move: Omit<MoveInput, 'promotion'>;
  mode: 'move' | 'premove';
}

@Component({
  selector: 'app-chess-board',
  imports: [ChessgroundBoardComponent, ModalFocusDirective],
  templateUrl: './chess-board.component.html',
  styleUrl: './chess-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChessBoardComponent implements AfterViewInit {
  @ViewChild(ChessgroundBoardComponent, { static: true })
  private board?: ChessgroundBoardComponent;

  private readonly controller = inject(GameController);
  protected readonly promotion = signal<PendingPromotion | null>(null);
  protected readonly promotionPieces: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];
  protected readonly state = this.controller.state;
  private shapes: DrawShape[] = [];

  constructor() {
    effect(() => {
      const state = this.state();
      this.syncBoard(state);
    });
  }

  ngAfterViewInit(): void {
    this.syncBoard(this.state());
  }

  @HostListener('document:keydown.escape')
  protected cancelPending(): void {
    if (this.promotion()) {
      this.promotion.set(null);
      this.board?.cancelMove();
      this.syncBoard(this.state());
      return;
    }
    this.controller.cancelPremove();
    this.board?.cancelPremove();
  }

  protected choosePromotion(piece: PromotionPiece): void {
    const pending = this.promotion();
    if (!pending) {
      return;
    }
    this.promotion.set(null);
    const move = { ...pending.move, promotion: piece };
    if (pending.mode === 'move') {
      void this.controller.makePlayerMove(move).then(() => this.syncBoard(this.state()));
    } else if (!this.controller.queuePremove(move)) {
      this.board?.cancelPremove();
    }
  }

  protected cancelPromotion(): void {
    this.promotion.set(null);
    this.board?.cancelMove();
    this.board?.cancelPremove();
    this.syncBoard(this.state());
  }

  protected pieceLabel(piece: PromotionPiece): string {
    return { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[piece];
  }

  protected boardConfig(): Config {
    return {
      disableContextMenu: true,
      coordinates: true,
      autoCastle: true,
      animation: {
        enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        duration: 160,
      },
      draggable: { enabled: true, showGhost: true },
      selectable: { enabled: true },
      movable: {
        free: false,
        showDests: true,
        rookCastle: false,
        events: {
          after: (from, to) => this.handleMove(from, to),
        },
      },
      premovable: {
        enabled: true,
        showDests: true,
        castle: true,
        events: {
          set: (from, to) => this.handlePremove(from, to),
          unset: () => this.controller.cancelPremove(),
        },
      },
      drawable: {
        enabled: true,
        visible: true,
        defaultSnapToValidMove: true,
        eraseOnMovablePieceClick: true,
        onChange: (shapes) => {
          this.shapes = shapes;
        },
      },
    };
  }

  private syncBoard(state: ReturnType<GameController['state']>): void {
    if (!this.board) {
      return;
    }
    const active = state.phase === 'active' && !state.result;
    const movableColor = active ? state.playerColor : undefined;
    this.board.set({
      fen: state.fen,
      orientation: state.orientation,
      turnColor: state.turn,
      check: state.checkSquare ? state.turn : false,
      lastMove: state.lastMove ? [...state.lastMove] : undefined,
      movable: {
        color: movableColor,
        dests: this.toDests(state.legalDestinations),
        showDests: state.preferences.showLegalMoves,
      },
      premovable: {
        enabled: active && state.preferences.premovesEnabled,
      },
      drawable: { shapes: this.shapes },
    });
    if (!state.pendingPremove) {
      this.board.cancelPremove();
    }
  }

  private handleMove(from: Key, to: Key): void {
    this.clearShapes();
    const move = { from: from as Square, to: to as Square };
    if (this.controller.promotionRequired(move)) {
      this.promotion.set({ move, mode: 'move' });
      return;
    }
    void this.controller.makePlayerMove(move).then(() => this.syncBoard(this.state()));
  }

  private handlePremove(from: Key, to: Key): void {
    const move = { from: from as Square, to: to as Square };
    if (this.controller.promotionRequired(move)) {
      this.promotion.set({ move, mode: 'premove' });
      return;
    }
    if (!this.controller.queuePremove(move)) {
      this.board?.cancelPremove();
    }
  }

  private clearShapes(): void {
    this.shapes = [];
    this.board?.setShapes([]);
  }

  private toDests(destinations: ReadonlyMap<Square, readonly Square[]>): Dests {
    const result: Dests = new Map();
    for (const [from, targets] of destinations) {
      result.set(
        from as Key,
        targets.map((target) => target as Key),
      );
    }
    return result;
  }
}

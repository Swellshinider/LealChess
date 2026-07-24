import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Config } from '@lichess-org/chessground/config';
import type { Dests, Key } from '@lichess-org/chessground/types';
import type { Square } from 'chess.js';
import { GameController } from '../../../core/game/game-controller.service';
import type { MoveInput, PromotionPiece } from '../../../core/game/game.types';

interface PendingPromotion {
  move: Omit<MoveInput, 'promotion'>;
  mode: 'move' | 'premove';
}

@Component({
  selector: 'app-chess-board',
  imports: [],
  templateUrl: './chess-board.component.html',
  styleUrl: './chess-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChessBoardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('boardHost', { static: true }) private boardHost!: ElementRef<HTMLElement>;

  private readonly controller = inject(GameController);
  protected readonly promotion = signal<PendingPromotion | null>(null);
  protected readonly promotionPieces: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];
  protected readonly state = this.controller.state;
  private api: Api | null = null;
  private shapes: DrawShape[] = [];
  private redrawFrame: number | null = null;
  private layoutKey = '';
  private fullRedrawPending = false;
  private readonly refreshBounds = () => this.api?.state.dom.bounds.clear();

  constructor() {
    effect(() => {
      const state = this.state();
      this.syncBoard(state);
    });
  }

  ngAfterViewInit(): void {
    this.api = Chessground(this.boardHost.nativeElement, this.createConfig());
    this.boardHost.nativeElement.addEventListener('mousedown', this.refreshBounds, true);
    this.boardHost.nativeElement.addEventListener('touchstart', this.refreshBounds, true);
    this.syncBoard(this.state());
  }

  ngOnDestroy(): void {
    if (this.redrawFrame !== null) {
      cancelAnimationFrame(this.redrawFrame);
    }
    this.boardHost.nativeElement.removeEventListener('mousedown', this.refreshBounds, true);
    this.boardHost.nativeElement.removeEventListener('touchstart', this.refreshBounds, true);
    this.api?.destroy();
  }

  @HostListener('document:keydown.escape')
  protected cancelPending(): void {
    if (this.promotion()) {
      this.promotion.set(null);
      this.api?.cancelMove();
      this.syncBoard(this.state());
      return;
    }
    this.controller.cancelPremove();
    this.api?.cancelPremove();
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
      this.api?.cancelPremove();
    }
  }

  protected cancelPromotion(): void {
    this.promotion.set(null);
    this.api?.cancelMove();
    this.api?.cancelPremove();
    this.syncBoard(this.state());
  }

  protected pieceLabel(piece: PromotionPiece): string {
    return { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[piece];
  }

  private createConfig(): Config {
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
    if (!this.api) {
      return;
    }
    const active = state.phase === 'active' && !state.result;
    const movableColor = active ? state.playerColor : undefined;
    this.api.set({
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
    const nextLayoutKey = `${state.gameId}:${state.restored}:${state.orientation}`;
    const requiresFullRedraw = nextLayoutKey !== this.layoutKey;
    this.layoutKey = nextLayoutKey;
    this.fullRedrawPending ||= requiresFullRedraw;
    if (this.redrawFrame !== null) {
      cancelAnimationFrame(this.redrawFrame);
    }
    this.redrawFrame = requestAnimationFrame(() => {
      if (this.fullRedrawPending) {
        this.api?.redrawAll();
        this.fullRedrawPending = false;
      } else {
        this.api?.state.dom.bounds.clear();
      }
      this.redrawFrame = null;
    });
    if (!state.pendingPremove) {
      this.api.cancelPremove();
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
      this.api?.cancelPremove();
    }
  }

  private clearShapes(): void {
    this.shapes = [];
    this.api?.setShapes([]);
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

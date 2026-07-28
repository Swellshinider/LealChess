import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Chess, type Move, type Square } from 'chess.js';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { Dests, Key } from '@lichess-org/chessground/types';
import type { BoardTheme, ChessColor } from '../../../core/game/game.types';
import { SoundService, type SoundEvent } from '../../../core/sound/sound.service';

@Component({
  selector: 'app-settings-preview-board',
  imports: [],
  templateUrl: './settings-preview-board.component.html',
  styleUrl: './settings-preview-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPreviewBoardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('boardHost', { static: true }) private boardHost!: ElementRef<HTMLElement>;

  readonly boardTheme = input.required<BoardTheme>();
  readonly orientation = input.required<ChessColor>();
  readonly showLegalMoves = input.required<boolean>();
  readonly soundEnabled = input.required<boolean>();

  protected readonly turn = signal<ChessColor>('white');
  private readonly sound = inject(SoundService);
  private chess = new Chess();
  private api: Api | null = null;
  private lastMove: readonly [Square, Square] | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      this.orientation();
      this.showLegalMoves();
      this.sound.setEnabled(this.soundEnabled());
      this.syncBoard();
    });
  }

  ngAfterViewInit(): void {
    this.api = Chessground(this.boardHost.nativeElement, this.createConfig());
    this.resizeObserver = new ResizeObserver(() => {
      this.api?.state.dom.bounds.clear();
      this.api?.redrawAll();
    });
    this.resizeObserver.observe(this.boardHost.nativeElement);
    this.syncBoard();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.api?.destroy();
  }

  protected unlockSound(): void {
    this.sound.unlock();
  }

  protected resetBoard(): void {
    this.chess = new Chess();
    this.lastMove = null;
    this.turn.set('white');
    this.syncBoard();
  }

  private createConfig(): Config {
    return {
      disableContextMenu: true,
      coordinates: true,
      autoCastle: true,
      animation: {
        enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        duration: 140,
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
      premovable: { enabled: false },
      drawable: { enabled: false, visible: false },
    };
  }

  private handleMove(from: Key, to: Key): void {
    const source = from as Square;
    const destination = to as Square;
    const piece = this.chess.get(source);
    const promotion =
      piece?.type === 'p' && (destination.endsWith('1') || destination.endsWith('8'))
        ? 'q'
        : undefined;

    try {
      const move = this.chess.move({ from: source, to: destination, promotion });
      this.lastMove = [source, destination];
      this.turn.set(this.chess.turn() === 'w' ? 'white' : 'black');
      this.playMoveSound(move);
    } catch {
      // Chessground normally prevents this path; resync if its optimistic move was rejected.
    }
    this.syncBoard();
  }

  private syncBoard(): void {
    if (!this.api) {
      return;
    }
    const gameOver = this.chess.isGameOver();
    const color = this.chess.turn() === 'w' ? 'white' : 'black';
    const king = this.chess.inCheck()
      ? (this.chess.findPiece({ type: 'k', color: this.chess.turn() })[0] ?? null)
      : null;
    this.turn.set(color);
    this.api.set({
      fen: this.chess.fen(),
      orientation: this.orientation(),
      turnColor: color,
      check: king ? color : false,
      lastMove: this.lastMove ? [...this.lastMove] : undefined,
      movable: {
        color: gameOver ? undefined : color,
        dests: this.legalDestinations(),
        showDests: this.showLegalMoves(),
      },
    });
    this.api.state.dom.bounds.clear();
    this.api.redrawAll();
  }

  private legalDestinations(): Dests {
    const destinations: Dests = new Map();
    for (const move of this.chess.moves({ verbose: true })) {
      const from = move.from as Key;
      const targets = destinations.get(from) ?? [];
      if (!targets.includes(move.to as Key)) {
        targets.push(move.to as Key);
      }
      destinations.set(from, targets);
    }
    return destinations;
  }

  private playMoveSound(move: Move): void {
    let event: SoundEvent = 'move';
    if (move.isPromotion()) {
      event = 'promotion';
    } else if (move.isKingsideCastle() || move.isQueensideCastle()) {
      event = 'castle';
    } else if (move.isCapture() || move.isEnPassant()) {
      event = 'capture';
    }
    this.sound.play(event);
    if (this.chess.inCheck() && !this.chess.isCheckmate()) {
      this.sound.play('check');
    }
  }
}

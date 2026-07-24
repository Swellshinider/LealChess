import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { ElementRef, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import type { ChessColor } from '../../../shared/chess/chess.types';
import { STARTING_FEN, type BoardTheme } from '../../../core/game/game.types';
import { PERSISTENCE_PORT } from '../../../core/persistence/persistence.types';
import { SoundService } from '../../../core/sound/sound.service';
import { CoachRepositoryService } from '../data/coach-repository.service';
import type { ChessPlatform, ImportedGame } from '../domain/coach.types';
import { reviewSoundEvents } from './review-sound';

@Component({
  selector: 'app-review-page',
  imports: [RouterLink],
  templateUrl: './review-page.component.html',
  styleUrl: './review-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPageComponent implements OnInit, OnDestroy {
  private readonly boardHost = viewChild<ElementRef<HTMLElement>>('boardHost');
  private readonly route = inject(ActivatedRoute);
  private readonly repository = inject(CoachRepositoryService);
  private readonly persistence = inject(PERSISTENCE_PORT);
  private readonly sound = inject(SoundService);
  protected readonly game = signal<ImportedGame | null>(null);
  protected readonly loading = signal(true);
  protected readonly currentPly = signal(0);
  protected readonly orientation = signal<ChessColor>('white');
  protected readonly boardTheme = signal<BoardTheme>('tournament');
  private api: Api | null = null;
  private apiElement: HTMLElement | null = null;
  private shapes: DrawShape[] = [];

  constructor() {
    effect(() => {
      this.currentPly();
      this.orientation();
      this.game();
      const host = this.boardHost()?.nativeElement;
      if (host && host !== this.apiElement) {
        this.api?.destroy();
        this.api = Chessground(host, this.boardConfig());
        this.apiElement = host;
      }
      this.syncBoard();
    });
  }

  async ngOnInit(): Promise<void> {
    const restored = await this.persistence.restore();
    this.sound.setEnabled(restored.preferences.soundEnabled);
    this.boardTheme.set(restored.preferences.boardTheme);
    const platform = this.route.snapshot.paramMap.get('platform') as ChessPlatform | null;
    const gameId = this.route.snapshot.paramMap.get('gameId');
    if ((platform === 'chess-com' || platform === 'lichess') && gameId) {
      const game = (await this.repository.game(platform, gameId)) ?? null;
      this.game.set(game);
      if (game) {
        const profile = (await this.repository.profiles()).find(
          (item) => item.platform === game.platform,
        );
        if (profile) {
          this.orientation.set(
            game.black.username.toLowerCase() === profile.username.toLowerCase()
              ? 'black'
              : 'white',
          );
        }
      }
    }
    this.loading.set(false);
  }

  ngOnDestroy(): void {
    this.api?.destroy();
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKey(event: KeyboardEvent): void {
    this.sound.unlock();
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return;
    }
    const action: Record<string, () => void> = {
      ArrowLeft: () => this.goTo(this.currentPly() - 1),
      ArrowRight: () => this.goTo(this.currentPly() + 1),
      Home: () => this.goTo(0),
      End: () => this.goTo(this.game()?.moves.length ?? 0),
    };
    if (action[event.key]) {
      event.preventDefault();
      action[event.key]?.();
    }
  }

  @HostListener('document:pointerdown')
  protected unlockSound(): void {
    this.sound.unlock();
  }

  protected goTo(ply: number): void {
    const maximum = this.game()?.moves.length ?? 0;
    const previousPly = this.currentPly();
    const nextPly = Math.max(0, Math.min(ply, maximum));
    if (nextPly === previousPly) return;
    this.currentPly.set(nextPly);
    const traversedMove = this.game()?.moves[Math.max(previousPly, nextPly) - 1];
    if (traversedMove) {
      for (const event of reviewSoundEvents(traversedMove)) {
        this.sound.play(event);
      }
    }
  }

  protected flipBoard(): void {
    this.orientation.update((color) => (color === 'white' ? 'black' : 'white'));
  }

  protected moveNumber(ply: number): string {
    return `${Math.ceil(ply / 2)}${ply % 2 === 0 ? '…' : '.'}`;
  }

  private boardConfig(): Config {
    return {
      fen: STARTING_FEN,
      orientation: this.orientation(),
      coordinates: true,
      disableContextMenu: true,
      animation: {
        enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        duration: 160,
      },
      movable: { color: undefined },
      draggable: { enabled: false },
      selectable: { enabled: false },
      drawable: {
        enabled: true,
        visible: true,
        defaultSnapToValidMove: true,
        eraseOnMovablePieceClick: false,
        onChange: (shapes) => {
          this.shapes = shapes;
        },
      },
    };
  }

  private syncBoard(): void {
    if (!this.api) return;
    const game = this.game();
    const ply = this.currentPly();
    const move = game?.moves[ply - 1];
    const initialFen = game?.moves[0]?.fenBefore ?? STARTING_FEN;
    this.api.set({
      fen: move?.fenAfter ?? initialFen,
      orientation: this.orientation(),
      lastMove: move ? ([move.from, move.to] as [Key, Key]) : undefined,
      turnColor: move?.color === 'white' ? 'black' : 'white',
      drawable: { shapes: this.shapes },
    });
    this.api.redrawAll();
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GameController } from '../../../core/game/game-controller.service';
import type { GamePhase, StartGameOptions } from '../../../core/game/game.types';
import { BoardFlipButtonComponent } from '../../../shared/chess/board-flip-button/board-flip-button.component';
import { SideNavigationComponent } from '../../../shared/layout/side-navigation/side-navigation.component';
import { CoachRepositoryService } from '../../coach/data/coach-repository.service';
import { normalizeLocalGame } from '../../coach/data/local-game-normalizer';
import { ChessBoardComponent } from '../chess-board/chess-board.component';
import { GameOverDialogComponent } from '../game-over-dialog/game-over-dialog.component';
import { GameSidebarComponent } from '../game-sidebar/game-sidebar.component';
import { NewGameDialogComponent } from '../new-game-dialog/new-game-dialog.component';

@Component({
  selector: 'app-play-page',
  imports: [
    BoardFlipButtonComponent,
    ChessBoardComponent,
    GameOverDialogComponent,
    GameSidebarComponent,
    NewGameDialogComponent,
    SideNavigationComponent,
  ],
  providers: [GameController],
  templateUrl: './play-page.component.html',
  styleUrl: './play-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayPageComponent implements OnInit, OnDestroy {
  protected readonly controller = inject(GameController);
  protected readonly newGameOpen = signal(false);
  protected readonly setupDismissed = signal(false);
  protected readonly reviewPending = signal(false);
  protected readonly reviewError = signal<string | null>(null);
  protected readonly gameOverOpen = signal(false);
  protected readonly state = this.controller.state;
  private readonly repository = inject(CoachRepositoryService);
  private readonly router = inject(Router);
  private newGameTrigger: HTMLElement | null = null;
  private previousPhase: GamePhase = this.state().phase;

  constructor() {
    effect(() => {
      const phase = this.state().phase;
      const previousPhase = this.previousPhase;
      this.previousPhase = phase;

      if (previousPhase === 'active' && phase === 'game-over') {
        this.gameOverOpen.set(true);
      } else if (phase !== 'game-over') {
        this.gameOverOpen.set(false);
      }
    });
  }

  ngOnInit(): void {
    void this.controller.initialize();
  }

  ngOnDestroy(): void {
    this.controller.destroy();
  }

  @HostListener('document:pointerdown')
  @HostListener('document:keydown')
  protected unlockSound(): void {
    this.controller.unlockSound();
  }

  protected openNewGame(event?: Event): void {
    if (event?.currentTarget instanceof HTMLElement) {
      this.newGameTrigger = event.currentTarget;
    }
    this.newGameOpen.set(true);
  }

  protected closeNewGame(): void {
    this.newGameOpen.set(false);
    this.setupDismissed.set(true);
    requestAnimationFrame(() => {
      const fallback = document.querySelector<HTMLElement>('[data-new-game-control]');
      (this.newGameTrigger ?? fallback)?.focus();
    });
  }

  protected startGame(options: StartGameOptions): void {
    this.newGameOpen.set(false);
    this.clearReviewState();
    void this.controller.startGame(options);
  }

  protected openNewGameFromResult(): void {
    this.gameOverOpen.set(false);
    this.openNewGame();
  }

  protected restartGameFromResult(): void {
    this.gameOverOpen.set(false);
    this.clearReviewState();
    void this.controller.restartGame();
  }

  protected async reviewGame(): Promise<void> {
    if (this.reviewPending() || this.state().phase !== 'game-over') return;
    this.reviewPending.set(true);
    this.reviewError.set(null);
    try {
      const game = normalizeLocalGame(this.state());
      await this.repository.saveLocalGame(game);
      await this.router.navigate(['/learn/review', game.platform, game.platformGameId], {
        queryParams: { autoAnalyze: true },
      });
    } catch {
      this.reviewError.set('The game could not be saved for review. Please try again.');
      this.reviewPending.set(false);
    }
  }

  private clearReviewState(): void {
    this.reviewPending.set(false);
    this.reviewError.set(null);
  }
}

import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GameController } from '../../../core/game/game-controller.service';
import type { StartGameOptions } from '../../../core/game/game.types';
import { SideNavigationComponent } from '../../../shared/layout/side-navigation/side-navigation.component';
import { CoachRepositoryService } from '../../coach/data/coach-repository.service';
import { normalizeLocalGame } from '../../coach/data/local-game-normalizer';
import { ChessBoardComponent } from '../chess-board/chess-board.component';
import { GameSidebarComponent } from '../game-sidebar/game-sidebar.component';
import { NewGameDialogComponent } from '../new-game-dialog/new-game-dialog.component';

@Component({
  selector: 'app-play-page',
  imports: [
    ChessBoardComponent,
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
  protected readonly reviewPending = signal(false);
  protected readonly reviewError = signal<string | null>(null);
  protected readonly state = this.controller.state;
  private readonly repository = inject(CoachRepositoryService);
  private readonly router = inject(Router);
  private newGameTrigger: HTMLElement | null = null;

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
    if (this.state().phase !== 'setup') {
      this.newGameOpen.set(false);
      requestAnimationFrame(() => this.newGameTrigger?.focus());
    }
  }

  protected startGame(options: StartGameOptions): void {
    this.newGameOpen.set(false);
    void this.controller.startGame(options);
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
}

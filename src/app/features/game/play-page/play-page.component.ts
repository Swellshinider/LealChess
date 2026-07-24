import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { GameController } from '../../../core/game/game-controller.service';
import type { StartGameOptions } from '../../../core/game/game.types';
import { ChessBoardComponent } from '../chess-board/chess-board.component';
import { GameSidebarComponent } from '../game-sidebar/game-sidebar.component';
import { NewGameDialogComponent } from '../new-game-dialog/new-game-dialog.component';

@Component({
  selector: 'app-play-page',
  imports: [ChessBoardComponent, GameSidebarComponent, NewGameDialogComponent],
  providers: [GameController],
  templateUrl: './play-page.component.html',
  styleUrl: './play-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayPageComponent implements OnInit, OnDestroy {
  protected readonly controller = inject(GameController);
  protected readonly newGameOpen = signal(false);
  protected readonly state = this.controller.state;

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

  protected openNewGame(): void {
    this.newGameOpen.set(true);
  }

  protected closeNewGame(): void {
    if (this.state().phase !== 'setup') {
      this.newGameOpen.set(false);
    }
  }

  protected startGame(options: StartGameOptions): void {
    this.newGameOpen.set(false);
    void this.controller.startGame(options);
  }
}

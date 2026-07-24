import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { GameController } from './core/game/game-controller.service';
import type { StartGameOptions } from './core/game/game.types';
import { ChessBoardComponent } from './features/game/chess-board/chess-board.component';
import { GameSidebarComponent } from './features/game/game-sidebar/game-sidebar.component';
import { NewGameDialogComponent } from './features/game/new-game-dialog/new-game-dialog.component';

@Component({
  selector: 'app-root',
  imports: [ChessBoardComponent, GameSidebarComponent, NewGameDialogComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
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

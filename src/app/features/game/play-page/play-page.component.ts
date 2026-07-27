import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { GameController } from '../../../core/game/game-controller.service';
import { ANALYSIS_ENGINE_PORT } from '../../../core/engine/analysis-engine.types';
import { StockfishAnalysisEngineService } from '../../../core/engine/stockfish-analysis-engine.service';
import type { StartGameOptions } from '../../../core/game/game.types';
import { SideNavigationComponent } from '../../../shared/layout/side-navigation/side-navigation.component';
import { ChessBoardComponent } from '../chess-board/chess-board.component';
import { GameSidebarComponent } from '../game-sidebar/game-sidebar.component';
import { NewGameDialogComponent } from '../new-game-dialog/new-game-dialog.component';
import { LiveMoveAnalysisService } from '../live-analysis/live-move-analysis.service';

@Component({
  selector: 'app-play-page',
  imports: [
    ChessBoardComponent,
    GameSidebarComponent,
    NewGameDialogComponent,
    SideNavigationComponent,
  ],
  providers: [
    GameController,
    LiveMoveAnalysisService,
    { provide: ANALYSIS_ENGINE_PORT, useClass: StockfishAnalysisEngineService },
  ],
  templateUrl: './play-page.component.html',
  styleUrl: './play-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayPageComponent implements OnInit, OnDestroy {
  protected readonly controller = inject(GameController);
  private readonly liveAnalysis = inject(LiveMoveAnalysisService);
  protected readonly newGameOpen = signal(false);
  protected readonly state = this.controller.state;
  private newGameTrigger: HTMLElement | null = null;

  ngOnInit(): void {
    void this.controller.initialize();
  }

  ngOnDestroy(): void {
    this.controller.destroy();
    this.liveAnalysis.destroy();
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
}

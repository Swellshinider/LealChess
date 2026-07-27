import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ChessColor } from '../../../shared/chess/chess.types';
import { SideNavigationComponent } from '../../../shared/layout/side-navigation/side-navigation.component';
import { CoachImportService } from '../data/coach-import.service';
import type { GameAnalysis, ImportedGame } from '../domain/coach.types';
import { categoryLabel, learnerColorForGame } from '../analysis/analysis-rules';

@Component({
  selector: 'app-learn-page',
  imports: [RouterLink, SideNavigationComponent],
  templateUrl: './learn-page.component.html',
  styleUrl: './learn-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearnPageComponent implements OnInit {
  protected readonly coach = inject(CoachImportService);
  async ngOnInit(): Promise<void> {
    await this.coach.initialize();
  }

  protected learnerColor(game: ImportedGame): ChessColor | undefined {
    return learnerColorForGame(game, this.coach.profiles());
  }

  protected resultLabel(game: ImportedGame): string {
    const color = this.learnerColor(game);
    if (!color) return game.result;
    if (game.result === '1/2-1/2' || game.result === '½-½' || game.result === '*') return 'Draw';
    return (game.result === '1-0') === (color === 'white') ? 'Win' : 'Loss';
  }

  protected reviewLink(game: ImportedGame): string[] {
    return ['/learn/review', game.platform, game.platformGameId];
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
      ? 'Unknown date'
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
  }

  protected analysisFor(game: ImportedGame): GameAnalysis | undefined {
    return this.coach.analyses().find((analysis) => analysis.importedGameKey === game.key);
  }

  protected analysisLabel(analysis: GameAnalysis): string {
    if (analysis.status === 'partial') {
      return `${analysis.moves.length} of ${analysis.totalUserMoves} moves analyzed`;
    }
    const moments = analysis.moves.filter((move) => move.classification !== 'good').length;
    return moments === 1 ? '1 learning moment' : `${moments} learning moments`;
  }

  protected categoryLabel = categoryLabel;
}

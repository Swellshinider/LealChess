import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { BoardTheme, MoveInput } from '../../core/game/game.types';
import type { ChessColor } from '../../shared/chess/chess.types';
import { ExplorerMoveScoreComponent } from './explorer-move-score.component';
import type { ExplorerCandidateLine, ExplorerSession } from './explorer.types';

@Component({
  selector: 'app-explorer-analysis-panel',
  imports: [ExplorerMoveScoreComponent],
  templateUrl: './explorer-analysis-panel.component.html',
  styleUrl: './explorer-analysis-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerAnalysisPanelComponent {
  readonly session = input.required<ExplorerSession>();
  readonly turn = input.required<ChessColor>();
  readonly boardTheme = input.required<BoardTheme>();
  readonly analysisActive = input.required<boolean>();
  readonly analysisMessage = input.required<string>();
  readonly gameOverLabel = input<string | null>(null);

  readonly importRequested = output<void>();
  readonly setupRequested = output<void>();
  readonly newAnalysisRequested = output<void>();
  readonly candidatePreviewed = output<ExplorerCandidateLine | null>();
  readonly candidateRequested = output<MoveInput>();
  readonly nodeRequested = output<string>();
  readonly pauseRequested = output<void>();
  readonly resumeRequested = output<void>();
  readonly retryRequested = output<void>();
  readonly firstRequested = output<void>();
  readonly previousRequested = output<void>();
  readonly nextRequested = output<void>();
  readonly lastRequested = output<void>();

  protected candidateEvaluation(line: ExplorerCandidateLine): string {
    const score = line.evaluation.score;
    if (score.kind === 'mate') {
      const whiteMoves = this.turn() === 'white' ? score.moves : -score.moves;
      return `${whiteMoves >= 0 ? '+' : '−'}M${Math.abs(whiteMoves)}`;
    }
    const whiteValue = this.turn() === 'white' ? score.value : -score.value;
    const pawns = whiteValue / 100;
    return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
  }

  protected candidateRuleWidth(rank: number): string {
    return `${{ 1: 14, 2: 9, 3: 5 }[rank] ?? 5}px`;
  }

  protected selectCandidate(line: ExplorerCandidateLine): void {
    this.candidatePreviewed.emit(null);
    this.candidateRequested.emit(line.firstMove);
  }

  protected batchProgress(): number {
    const batch = this.session().batch;
    return batch.total ? Math.round((batch.completed / batch.total) * 100) : 100;
  }

  protected moveCount(): number {
    return Math.max(0, Object.keys(this.session().nodes).length - 1);
  }
}

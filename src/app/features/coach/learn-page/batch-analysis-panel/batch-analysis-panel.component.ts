import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { selectGamesForBatchAnalysis } from '../../analysis/batch-analysis-selection';
import { BatchAnalysisService } from '../../analysis/batch-analysis.service';
import { CoachImportService } from '../../data/coach-import.service';

const UNLIMITED = Number.MAX_SAFE_INTEGER;

@Component({
  selector: 'app-batch-analysis-panel',
  imports: [ReactiveFormsModule],
  templateUrl: './batch-analysis-panel.component.html',
  styleUrl: './batch-analysis-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchAnalysisPanelComponent {
  protected readonly coach = inject(CoachImportService);
  protected readonly batch = inject(BatchAnalysisService);
  protected readonly state = this.batch.state;
  protected readonly progress = this.batch.progress;
  protected readonly active = this.batch.active;
  protected readonly batchForm = new FormGroup({
    count: new FormControl(10, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(50)],
    }),
  });
  protected readonly eligibleCount = computed(
    () =>
      selectGamesForBatchAnalysis(
        this.coach.games(),
        this.coach.profiles(),
        this.coach.analyses(),
        UNLIMITED,
      ).length,
  );
  private readonly completionCount = computed(() => this.state().completed + this.state().failed);

  constructor() {
    // Every time a queued game finishes (or fails), refresh the ledger's analyses so the archive
    // badges, analyzed-game count, and study priorities update live while the batch keeps running.
    effect(() => {
      if (this.completionCount() > 0) void this.coach.refreshAnalyses();
    });
  }

  protected start(): void {
    if (this.batchForm.invalid || this.active() || !this.eligibleCount()) return;
    void this.batch.start(
      this.coach.games(),
      this.coach.profiles(),
      this.coach.analyses(),
      this.batchForm.controls.count.value,
    );
  }

  protected cancel(): void {
    this.batch.cancel();
  }

  protected dismiss(): void {
    this.batch.reset();
  }

  protected summaryLabel(): string {
    const state = this.state();
    const analyzed = `${state.completed} ${state.completed === 1 ? 'game' : 'games'} analyzed`;
    if (!state.failed) return `${analyzed}.`;
    const failed = `${state.failed} could not be analyzed`;
    return `${analyzed} · ${failed}.`;
  }

  protected progressLabel(): string {
    const state = this.state();
    return `Analyzing game ${state.currentIndex} of ${state.total} · ${state.currentMoves.completed} of ${state.currentMoves.total} moves`;
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { ElementRef, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OnboardingAnchorDirective } from '../../../core/onboarding/onboarding-anchor.directive';
import { ModalFocusDirective } from '../../../shared/a11y/modal-focus.directive';
import { SideNavigationComponent } from '../../../shared/layout/side-navigation/side-navigation.component';
import { CoachImportService } from '../data/coach-import.service';
import type { GameAnalysis, ImportedGame } from '../domain/coach.types';
import type { GameSource } from '../domain/coach.types';
import { categoryLabel } from '../analysis/analysis-rules';
import { isConcernClassification } from '../../../core/analysis/move-classification';
import { ImportPanelComponent } from '../import-panel/import-panel.component';
import { BatchAnalysisPanelComponent } from './batch-analysis-panel/batch-analysis-panel.component';
import {
  DEFAULT_LEARN_GAME_FILTERS,
  availableGameSpeeds,
  filterAndSortGames,
  learnerOutcome,
  ratingSeriesForGames,
} from './learn-page.utils';
import type { LearnGameResultFilter, LearnGameSort, LearnGameOutcome } from './learn-page.utils';
import { RatingTrendComponent } from './rating-trend/rating-trend.component';

@Component({
  selector: 'app-learn-page',
  imports: [
    BatchAnalysisPanelComponent,
    ImportPanelComponent,
    ModalFocusDirective,
    OnboardingAnchorDirective,
    RatingTrendComponent,
    RouterLink,
    SideNavigationComponent,
  ],
  templateUrl: './learn-page.component.html',
  styleUrl: './learn-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearnPageComponent implements OnInit {
  private readonly gamesHeading = viewChild<ElementRef<HTMLElement>>('gamesHeading');
  protected readonly coach = inject(CoachImportService);
  protected readonly filters = signal({ ...DEFAULT_LEARN_GAME_FILTERS });
  protected readonly deleteCandidate = signal<ImportedGame | null>(null);
  protected readonly deletePending = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly filteredGames = computed(() =>
    filterAndSortGames(this.coach.games(), this.coach.profiles(), this.filters()),
  );
  protected readonly gameSpeeds = computed(() => availableGameSpeeds(this.coach.games()));
  protected readonly ratingSeries = computed(() =>
    ratingSeriesForGames(this.coach.games(), this.coach.profiles()),
  );
  protected readonly hasActiveFilters = computed(() => {
    const filters = this.filters();
    return (
      filters.result !== 'all' ||
      filters.platform !== 'all' ||
      filters.speed !== 'all' ||
      filters.sort !== 'newest'
    );
  });

  async ngOnInit(): Promise<void> {
    await this.coach.initialize();
  }

  protected outcome(game: ImportedGame): LearnGameOutcome {
    return learnerOutcome(game, this.coach.profiles());
  }

  protected resultLabel(game: ImportedGame): string {
    return {
      win: 'Win',
      draw: 'Draw',
      loss: 'Loss',
      unknown: game.result,
    }[this.outcome(game)];
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
    const moments = analysis.moves.filter((move) =>
      isConcernClassification(move.reviewClassification),
    ).length;
    return moments === 1 ? '1 learning moment' : `${moments} learning moments`;
  }

  protected setResultFilter(event: Event): void {
    this.filters.update((filters) => ({
      ...filters,
      result: (event.target as HTMLSelectElement).value as LearnGameResultFilter,
    }));
  }

  protected setPlatformFilter(event: Event): void {
    this.filters.update((filters) => ({
      ...filters,
      platform: (event.target as HTMLSelectElement).value as 'all' | GameSource,
    }));
  }

  protected setSpeedFilter(event: Event): void {
    this.filters.update((filters) => ({
      ...filters,
      speed: (event.target as HTMLSelectElement).value,
    }));
  }

  protected setSort(event: Event): void {
    this.filters.update((filters) => ({
      ...filters,
      sort: (event.target as HTMLSelectElement).value as LearnGameSort,
    }));
  }

  protected clearFilters(): void {
    this.filters.set({ ...DEFAULT_LEARN_GAME_FILTERS });
  }

  protected platformLabel(platform: GameSource): string {
    if (platform === 'chess-com') return 'Chess.com';
    if (platform === 'lichess') return 'Lichess';
    return 'LealChess';
  }

  protected speedLabel(speed: string): string {
    return speed
      .split('-')
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join(' ');
  }

  protected requestDelete(game: ImportedGame, event: Event): void {
    this.deleteCandidate.set(game);
    this.deleteError.set(null);
    this.deleteTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  }

  protected closeDelete(): void {
    if (this.deletePending()) return;
    this.deleteCandidate.set(null);
    this.deleteError.set(null);
    requestAnimationFrame(() => this.deleteTrigger?.focus());
  }

  protected async confirmDelete(): Promise<void> {
    const game = this.deleteCandidate();
    if (!game || this.deletePending()) return;
    this.deletePending.set(true);
    this.deleteError.set(null);
    try {
      await this.coach.deleteGame(game);
      this.deleteCandidate.set(null);
      requestAnimationFrame(() => this.gamesHeading()?.nativeElement.focus());
      this.deleteTrigger = null;
    } catch {
      this.deleteError.set('The game could not be deleted. Please try again.');
    } finally {
      this.deletePending.set(false);
    }
  }

  protected categoryLabel = categoryLabel;
  private deleteTrigger: HTMLElement | null = null;
}

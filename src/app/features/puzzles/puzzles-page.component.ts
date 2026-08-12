import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { OnInit } from '@angular/core';
import { Chess, type Square } from 'chess.js';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { firstValueFrom } from 'rxjs';
import { legalDestinations } from '../../core/game/chess-move';
import type { MoveInput, PromotionPiece } from '../../core/game/game.types';
import { ChessgroundBoardComponent } from '../../shared/chess/chessground-board/chessground-board.component';
import { SideNavigationComponent } from '../../shared/layout/side-navigation/side-navigation.component';
import { normalizeChessComDaily, normalizeLichessDaily } from './puzzle-adapters';
import { choosePracticePuzzle, expandCatalog, matchingPuzzles } from './puzzle-catalog';
import { PUZZLE_CATALOG } from './puzzle-catalog.generated';
import { PuzzleRepositoryService, puzzleStats } from './puzzle-repository.service';
import { PuzzleTagComboboxComponent } from './puzzle-tag-combobox.component';
import {
  createSolver,
  playPuzzleMove,
  revealPuzzle,
  useHint,
  type SolverState,
} from './puzzle-solver';
import { localDate, type CachedDailyPuzzle, type Puzzle, type PuzzleAttempt } from './puzzle.types';

interface DailyState {
  status: 'loading' | 'ready' | 'error';
  cached?: CachedDailyPuzzle;
  error?: string;
}

@Component({
  selector: 'app-puzzles-page',
  imports: [ChessgroundBoardComponent, PuzzleTagComboboxComponent, SideNavigationComponent],
  templateUrl: './puzzles-page.component.html',
  styleUrl: './puzzles-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PuzzlesPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly repository = inject(PuzzleRepositoryService);
  private readonly board = viewChild(ChessgroundBoardComponent);
  private readonly today = localDate();
  private readonly catalog = expandCatalog(PUZZLE_CATALOG);
  private readonly recordedStates = new WeakSet<SolverState>();

  protected readonly lichess = signal<DailyState>({ status: 'loading' });
  protected readonly chessCom = signal<DailyState>({ status: 'loading' });
  protected readonly attempts = signal<PuzzleAttempt[]>([]);
  protected readonly activePuzzle = signal<Puzzle | null>(null);
  protected readonly activeDaily = signal<CachedDailyPuzzle | null>(null);
  protected readonly solver = signal<SolverState | null>(null);
  protected readonly announcement = signal('Choose a puzzle to begin.');
  protected readonly pendingPromotion = signal<Omit<MoveInput, 'promotion'> | null>(null);
  protected readonly promotionPieces: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];
  protected readonly selectedTags = signal<string[]>([]);
  protected readonly minimum = signal(PUZZLE_CATALOG.ratingBounds[0]);
  protected readonly maximum = signal(PUZZLE_CATALOG.ratingBounds[1]);
  protected readonly practiceError = signal<string | null>(null);
  protected readonly themes = [...new Set(this.catalog.flatMap((puzzle) => puzzle.themes))].sort();
  protected readonly openings = [
    ...new Set(this.catalog.flatMap((puzzle) => puzzle.openings)),
  ].sort();
  protected readonly catalogCount = this.catalog.length;
  protected readonly catalogMinimum = PUZZLE_CATALOG.ratingBounds[0];
  protected readonly catalogMaximum = PUZZLE_CATALOG.ratingBounds[1];
  protected readonly stats = computed(() => puzzleStats(this.attempts(), this.today));
  protected readonly recentAttempts = computed(() => this.attempts().slice(0, 20));
  protected readonly ratingInvalid = computed(() => this.minimum() > this.maximum());
  protected readonly selectedThemes = computed(() =>
    this.selectedTags().filter((tag) => this.themes.includes(tag)),
  );
  protected readonly selectedOpenings = computed(() =>
    this.selectedTags().filter((tag) => this.openings.includes(tag)),
  );
  protected readonly expectedMove = computed(() => {
    const puzzle = this.activePuzzle();
    const state = this.solver();
    return puzzle && state ? puzzle.solution[state.index] : undefined;
  });

  protected readonly boardConfig = computed<Config>(() => ({
    fen: this.solver()?.fen ?? this.activePuzzle()?.fen,
    orientation: this.activePuzzle()?.fen.split(' ')[1] === 'b' ? 'black' : 'white',
    turnColor: this.turnColor(),
    coordinates: true,
    disableContextMenu: true,
    animation: { enabled: !this.reducedMotion(), duration: 180 },
    draggable: { enabled: true, showGhost: true },
    selectable: { enabled: true },
    movable: {
      free: false,
      color: this.solver()?.complete ? undefined : this.turnColor(),
      dests: this.solver() ? legalDestinations(this.solver()!.fen) : new Map(),
      showDests: true,
      events: { after: (from, to) => this.handleMove(from, to) },
    },
    premovable: { enabled: false },
    drawable: { enabled: false, visible: true },
  }));

  constructor() {
    effect(() => {
      const config = this.boardConfig();
      const board = this.board();
      if (board) {
        board.set(config);
        board.setShapes(this.hintShapes());
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.attempts.set(await this.repository.attempts());
    await Promise.all([this.loadDaily('lichess'), this.loadDaily('chess-com')]);
  }

  protected selectDaily(state: DailyState): void {
    if (state.cached) this.start(state.cached.puzzle, state.cached);
  }

  protected startPractice(): void {
    if (this.ratingInvalid()) {
      this.practiceError.set('Minimum rating cannot be greater than maximum rating.');
      return;
    }
    const matches = matchingPuzzles(
      this.catalog,
      this.selectedTags(),
      this.minimum(),
      this.maximum(),
    );
    const puzzle = choosePracticePuzzle(matches, this.attempts());
    if (!puzzle) {
      this.practiceError.set(
        'No puzzles match this intersection. Remove a tag or widen the rating range.',
      );
      return;
    }
    this.practiceError.set(null);
    this.start(puzzle, null);
  }

  protected updateTagGroup(group: 'themes' | 'openings', selected: readonly string[]): void {
    const groupOptions = new Set(group === 'themes' ? this.themes : this.openings);
    this.selectedTags.update((tags) => [
      ...tags.filter((tag) => !groupOptions.has(tag)),
      ...selected,
    ]);
  }

  protected updateMinimum(value: string): void {
    this.minimum.set(Number(value));
  }
  protected updateMaximum(value: string): void {
    this.maximum.set(Number(value));
  }

  protected choosePromotion(piece: PromotionPiece): void {
    const pending = this.pendingPromotion();
    if (!pending) return;
    this.pendingPromotion.set(null);
    this.submitMove({ ...pending, promotion: piece });
  }

  protected cancelPromotion(): void {
    this.pendingPromotion.set(null);
    this.syncBoard();
  }

  protected hint(): void {
    const state = this.solver();
    if (!state) return;
    this.solver.set(useHint(state));
    this.announcement.set(
      state.hintLevel === 0 ? 'The correct piece is highlighted.' : 'The destination is shown.',
    );
  }

  protected reveal(): void {
    const puzzle = this.activePuzzle();
    const state = this.solver();
    if (!puzzle || !state) return;
    this.solver.set(revealPuzzle(puzzle, state));
    this.announcement.set('Solution revealed.');
    void this.completeAttempt();
  }

  protected next(): void {
    this.activePuzzle.set(null);
    this.activeDaily.set(null);
    this.solver.set(null);
    this.announcement.set('Choose another puzzle.');
  }

  protected stale(state: DailyState): boolean {
    return Boolean(state.cached && state.cached.fetchedDate !== this.today);
  }
  protected dailyCompleted(cached: CachedDailyPuzzle): boolean {
    return this.attempts().some(
      (attempt) =>
        attempt.source === cached.puzzle.source && attempt.puzzleKey === cached.puzzle.key,
    );
  }
  protected completeLabel(): string {
    return (this.solver()?.outcome ?? '').replaceAll('-', ' ');
  }
  protected displayTag(tag: string): string {
    return tag.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  private async loadDaily(provider: 'lichess' | 'chess-com'): Promise<void> {
    const target = provider === 'lichess' ? this.lichess : this.chessCom;
    try {
      const raw = await firstValueFrom(
        this.http.get<unknown>(
          provider === 'lichess'
            ? 'https://lichess.org/api/puzzle/daily'
            : 'https://api.chess.com/pub/puzzle',
        ),
      );
      const puzzle =
        provider === 'lichess' ? normalizeLichessDaily(raw) : normalizeChessComDaily(raw);
      const cached: CachedDailyPuzzle = {
        id: provider,
        provider,
        fetchedDate: this.today,
        fetchedAt: new Date().toISOString(),
        puzzle,
      };
      await this.repository.cacheDaily(cached);
      target.set({ status: 'ready', cached });
    } catch {
      const cached = await this.repository.cachedDaily(provider);
      target.set(
        cached
          ? { status: 'ready', cached, error: 'Live puzzle unavailable; showing the saved puzzle.' }
          : { status: 'error', error: 'Daily puzzle is unavailable. Try again later.' },
      );
    }
  }

  private start(puzzle: Puzzle, daily: CachedDailyPuzzle | null): void {
    this.activePuzzle.set(puzzle);
    this.activeDaily.set(daily);
    this.solver.set(createSolver(puzzle));
    this.announcement.set(`${puzzle.title ?? 'Puzzle'}: ${this.turnColor()} to move.`);
  }

  private handleMove(from: Key, to: Key): void {
    const puzzle = this.activePuzzle();
    const state = this.solver();
    if (!puzzle || !state) return;
    const piece = new Chess(state.fen).get(from as Square);
    if (piece?.type === 'p' && (to.endsWith('1') || to.endsWith('8'))) {
      this.pendingPromotion.set({ from: from as Square, to: to as Square });
      this.syncBoard();
      return;
    }
    this.submitMove({ from: from as Square, to: to as Square });
  }

  private submitMove(move: MoveInput): void {
    const puzzle = this.activePuzzle();
    const state = this.solver();
    if (!puzzle || !state) return;
    const next = playPuzzleMove(puzzle, state, move);
    this.solver.set(next);
    if (next.mistakes > state.mistakes) this.announcement.set('That is not the move. Try again.');
    else if (next.complete) {
      this.announcement.set(`Puzzle ${next.outcome?.replaceAll('-', ' ')}.`);
      void this.completeAttempt();
    } else this.announcement.set('Correct. Your move.');
    this.syncBoard();
  }

  private async completeAttempt(): Promise<void> {
    const puzzle = this.activePuzzle();
    const state = this.solver();
    if (!puzzle || !state?.complete || !state.outcome) return;
    if (this.recordedStates.has(state)) return;
    this.recordedStates.add(state);
    const daily = this.activeDaily();
    const now = new Date().toISOString();
    const attempt: PuzzleAttempt = {
      id: `${puzzle.source}:${puzzle.key}:${now}`,
      puzzleKey: puzzle.key,
      source: puzzle.source,
      outcome: state.outcome,
      mistakes: state.mistakes,
      hintLevel: state.hintLevel,
      rating: puzzle.rating,
      themes: puzzle.themes,
      openings: puzzle.openings,
      startedAt: state.startedAt,
      completedAt: now,
      dailyDate: daily?.fetchedDate,
      dailyCredit: state.outcome === 'clean-solved' && daily?.fetchedDate === this.today,
    };
    await this.repository.recordAttempt(attempt);
    this.attempts.set(await this.repository.attempts());
  }

  private hintShapes(): DrawShape[] {
    const expected = this.expectedMove();
    const level = this.solver()?.hintLevel ?? 0;
    if (!expected || level === 0) return [];
    return [
      {
        orig: expected.slice(0, 2) as Key,
        ...(level === 2 ? { dest: expected.slice(2, 4) as Key } : {}),
        brush: 'green',
      },
    ];
  }

  private turnColor(): 'white' | 'black' {
    return (this.solver()?.fen ?? this.activePuzzle()?.fen)?.split(' ')[1] === 'b'
      ? 'black'
      : 'white';
  }
  private syncBoard(): void {
    this.board()?.set(this.boardConfig());
  }
  private reducedMotion(): boolean {
    return (
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}

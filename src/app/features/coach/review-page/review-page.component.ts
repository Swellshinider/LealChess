import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { ElementRef, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Dests, Key } from '@lichess-org/chessground/types';
import { Chess, type Square } from 'chess.js';
import { boardOverlayPosition } from '../../../shared/chess/board-overlay-position';
import type { ChessColor } from '../../../shared/chess/chess.types';
import { ModalFocusDirective } from '../../../shared/a11y/modal-focus.directive';
import { SideNavigationComponent } from '../../../shared/layout/side-navigation/side-navigation.component';
import {
  STARTING_FEN,
  type BoardTheme,
  type MoveInput,
  type PromotionPiece,
} from '../../../core/game/game.types';
import { PERSISTENCE_PORT } from '../../../core/persistence/persistence.types';
import { SoundService } from '../../../core/sound/sound.service';
import {
  categoryLabel,
  learnerColorForGame,
  moveAnalysisForPly,
  moveToUci,
  trainingPositions,
} from '../analysis/analysis-rules';
import { CoachAnalysisService } from '../analysis/coach-analysis.service';
import { CoachRepositoryService } from '../data/coach-repository.service';
import type {
  ChessPlatform,
  EngineEvaluation,
  ImportedGame,
  MoveAnalysis,
  MoveClassification,
  MistakeCategory,
  PlatformPlayer,
  ReviewMoveClassification,
  TrainingPosition,
} from '../domain/coach.types';
import { reviewSoundEvents } from './review-sound';

type ReviewMode = 'review' | 'practice';
type PuzzleStatus = 'ready' | 'incorrect' | 'correct' | 'revealed';

@Component({
  selector: 'app-review-page',
  imports: [ModalFocusDirective, RouterLink, SideNavigationComponent],
  templateUrl: './review-page.component.html',
  styleUrl: './review-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPageComponent implements OnInit, OnDestroy {
  private readonly boardHost = viewChild<ElementRef<HTMLElement>>('boardHost');
  private readonly route = inject(ActivatedRoute);
  private readonly repository = inject(CoachRepositoryService);
  private readonly persistence = inject(PERSISTENCE_PORT);
  private readonly sound = inject(SoundService);
  protected readonly coachAnalysis = inject(CoachAnalysisService);
  protected readonly game = signal<ImportedGame | null>(null);
  protected readonly loading = signal(true);
  protected readonly currentPly = signal(0);
  protected readonly orientation = signal<ChessColor>('white');
  protected readonly learnerColor = signal<ChessColor | null>(null);
  protected readonly boardTheme = signal<BoardTheme>('tournament');
  protected readonly mode = signal<ReviewMode>('review');
  protected readonly trainingIndex = signal(0);
  protected readonly puzzleStatus = signal<PuzzleStatus>('ready');
  protected readonly pendingPromotion = signal<Omit<MoveInput, 'promotion'> | null>(null);
  protected readonly practiceLine = signal<MoveInput[]>([]);
  protected readonly promotionPieces: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];
  protected readonly positions = computed(() => {
    const game = this.game();
    return game ? trainingPositions(game, this.coachAnalysis.analysis()) : [];
  });
  protected readonly activePosition = computed<TrainingPosition | null>(
    () => this.positions()[this.trainingIndex()] ?? null,
  );
  protected readonly currentAnalysis = computed<MoveAnalysis | undefined>(() =>
    moveAnalysisForPly(this.coachAnalysis.analysis(), this.currentPly()),
  );
  protected readonly learnerPlayer = computed<PlatformPlayer | null>(() => {
    const game = this.game();
    const color = this.learnerColor();
    return game && color ? game[color] : null;
  });
  protected readonly opponentPlayer = computed<PlatformPlayer | null>(() => {
    const game = this.game();
    const color = this.learnerColor();
    if (!game || !color) return null;
    return game[color === 'white' ? 'black' : 'white'];
  });
  protected readonly boardTurn = computed<ChessColor>(() => {
    if (this.mode() === 'practice') return turnColor(this.practiceFen());
    const game = this.game();
    const ply = this.currentPly();
    const fen = game?.moves[ply - 1]?.fenAfter ?? game?.moves[0]?.fenBefore ?? STARTING_FEN;
    return turnColor(fen);
  });
  protected readonly analysisMoves = computed(() => {
    const game = this.game();
    return game?.moves ?? [];
  });
  private api: Api | null = null;
  private apiElement: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private shapes: DrawShape[] = [];

  constructor() {
    effect(() => {
      this.currentPly();
      this.orientation();
      this.game();
      this.mode();
      this.trainingIndex();
      this.puzzleStatus();
      this.practiceLine();
      const host = this.boardHost()?.nativeElement;
      if (host && host !== this.apiElement) {
        this.api?.destroy();
        this.resizeObserver?.disconnect();
        this.api = Chessground(host, this.boardConfig());
        this.apiElement = host;
        this.resizeObserver = new ResizeObserver(() => {
          if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
          this.resizeFrame = requestAnimationFrame(() => {
            this.api?.state.dom.bounds.clear();
            this.api?.redrawAll();
            this.resizeFrame = null;
          });
        });
        this.resizeObserver.observe(host);
      }
      this.syncBoard();
    });
  }

  async ngOnInit(): Promise<void> {
    const restored = await this.persistence.restore();
    this.sound.setEnabled(restored.preferences.soundEnabled);
    this.boardTheme.set(restored.preferences.boardTheme);
    const platform = this.route.snapshot.paramMap.get('platform') as ChessPlatform | null;
    const gameId = this.route.snapshot.paramMap.get('gameId');
    if ((platform === 'chess-com' || platform === 'lichess') && gameId) {
      const [game, profiles] = await Promise.all([
        this.repository.game(platform, gameId),
        this.repository.profiles(),
      ]);
      this.game.set(game ?? null);
      if (game) {
        const color = learnerColorForGame(game, profiles) ?? null;
        this.learnerColor.set(color);
        if (color) {
          this.orientation.set(color);
          await this.coachAnalysis.load(game, color);
        }
      }
    }
    this.loading.set(false);
  }

  ngOnDestroy(): void {
    this.coachAnalysis.cancel();
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeObserver?.disconnect();
    this.api?.destroy();
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKey(event: KeyboardEvent): void {
    this.sound.unlock();
    const target = event.target;
    const isInteractive =
      target instanceof HTMLElement &&
      Boolean(
        target.closest(
          'button, a, input, select, textarea, summary, [contenteditable="true"], [role="dialog"]',
        ),
      );
    if (this.mode() !== 'review' || this.pendingPromotion() || isInteractive) {
      return;
    }
    const action: Record<string, () => void> = {
      ArrowLeft: () => this.goTo(this.currentPly() - 1),
      ArrowRight: () => this.goTo(this.currentPly() + 1),
      Home: () => this.goTo(0),
      End: () => this.goTo(this.game()?.moves.length ?? 0),
    };
    if (action[event.key]) {
      event.preventDefault();
      action[event.key]?.();
    }
  }

  @HostListener('document:keydown.escape')
  protected cancelPromotion(): void {
    if (!this.pendingPromotion()) return;
    this.pendingPromotion.set(null);
    this.api?.cancelMove();
    this.syncBoard();
  }

  protected handleModeKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const wantsPractice = event.key === 'ArrowRight' || event.key === 'End';
    if (wantsPractice && this.positions().length) {
      this.enterPractice(this.trainingIndex());
      queueMicrotask(() => document.getElementById('practice-tab')?.focus());
    } else {
      this.leavePractice();
      queueMicrotask(() => document.getElementById('score-sheet-tab')?.focus());
    }
  }

  @HostListener('document:pointerdown')
  protected unlockSound(): void {
    this.sound.unlock();
  }

  protected async analyze(): Promise<void> {
    const game = this.game();
    const color = this.learnerColor();
    if (!game || !color) return;
    await this.coachAnalysis.analyze(game, color);
  }

  protected cancelAnalysis(): void {
    this.coachAnalysis.cancel();
  }

  protected goTo(ply: number): void {
    const maximum = this.game()?.moves.length ?? 0;
    const previousPly = this.currentPly();
    const nextPly = Math.max(0, Math.min(ply, maximum));
    if (nextPly === previousPly) return;
    this.currentPly.set(nextPly);
    const traversedMove = this.game()?.moves[Math.max(previousPly, nextPly) - 1];
    if (traversedMove) {
      for (const event of reviewSoundEvents(traversedMove)) this.sound.play(event);
    }
  }

  protected enterPractice(index = 0): void {
    if (!this.positions().length) return;
    this.trainingIndex.set(Math.max(0, Math.min(index, this.positions().length - 1)));
    this.puzzleStatus.set('ready');
    this.practiceLine.set([]);
    this.shapes = [];
    this.pendingPromotion.set(null);
    this.mode.set('practice');
  }

  protected leavePractice(): void {
    this.pendingPromotion.set(null);
    this.practiceLine.set([]);
    this.shapes = [];
    this.mode.set('review');
  }

  protected nextPosition(): void {
    const next = (this.trainingIndex() + 1) % this.positions().length;
    this.trainingIndex.set(next);
    this.puzzleStatus.set('ready');
    this.practiceLine.set([]);
    this.shapes = [];
  }

  protected revealMove(): void {
    this.pendingPromotion.set(null);
    this.practiceLine.set([]);
    this.shapes = [];
    this.puzzleStatus.set('revealed');
  }

  protected resetPractice(): void {
    this.pendingPromotion.set(null);
    this.practiceLine.set([]);
    this.shapes = [];
    this.puzzleStatus.set('ready');
  }

  protected choosePromotion(piece: PromotionPiece): void {
    const pending = this.pendingPromotion();
    if (!pending) return;
    this.pendingPromotion.set(null);
    this.gradeMove({ ...pending, promotion: piece });
  }

  protected flipBoard(): void {
    this.orientation.update((color) => (color === 'white' ? 'black' : 'white'));
  }

  protected moveNumber(ply: number): string {
    return `${Math.ceil(ply / 2)}${ply % 2 === 0 ? '…' : '.'}`;
  }

  protected moveAnalysis(ply: number): MoveAnalysis | undefined {
    return moveAnalysisForPly(this.coachAnalysis.analysis(), ply);
  }

  protected classificationLabel(
    classification: MoveClassification | ReviewMoveClassification,
  ): string {
    return classification.charAt(0).toUpperCase() + classification.slice(1);
  }

  protected classificationPosition(square: string): string {
    return boardOverlayPosition(square, this.orientation());
  }

  protected playerInitials(player: PlatformPlayer | null): string {
    const normalized = player?.username.replace(/[^a-z0-9]/gi, '') ?? '';
    return normalized.slice(0, 2).toUpperCase() || '♟';
  }

  protected learnerSide(): ChessColor {
    return this.learnerColor() ?? 'white';
  }

  protected opponentSide(): ChessColor {
    return this.learnerSide() === 'white' ? 'black' : 'white';
  }

  protected currentMoveDestination(): string | null {
    return this.game()?.moves[this.currentPly() - 1]?.to ?? null;
  }

  protected reviewClassification(ply: number): ReviewMoveClassification | undefined {
    return this.moveAnalysis(ply)?.reviewClassification;
  }

  protected categoryLabel = categoryLabel;

  protected evaluationLabel(evaluation: EngineEvaluation): string {
    if (evaluation.score.kind === 'mate') {
      return `${evaluation.score.moves >= 0 ? '+' : '−'}M${Math.abs(evaluation.score.moves)}`;
    }
    const pawns = evaluation.score.value / 100;
    return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
  }

  protected analysisButtonLabel(): string {
    const state = this.coachAnalysis.state();
    return state.phase === 'partial' || state.phase === 'error'
      ? 'Resume analysis'
      : 'Analyze game';
  }

  protected analysisProgress(): number {
    const state = this.coachAnalysis.state();
    return state.total ? Math.round((state.completed / state.total) * 100) : 0;
  }

  protected gameMomentCount(): number {
    return (
      this.coachAnalysis.analysis()?.moves.filter((move) => move.classification !== 'good')
        .length ?? 0
    );
  }

  protected gameSummary(): string {
    const mistakes =
      this.coachAnalysis.analysis()?.moves.filter((move) => move.category !== undefined) ?? [];
    if (!mistakes.length) return 'No missed opportunities crossed the analysis thresholds.';
    const counts = new Map<MistakeCategory, number>();
    for (const move of mistakes) {
      if (move.category) counts.set(move.category, (counts.get(move.category) ?? 0) + 1);
    }
    const [topCategory, count] = [...counts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0]!;
    return `Most often: ${categoryLabel(topCategory)} — ${count} of ${mistakes.length} moments.`;
  }

  protected practiceIndexForPly(ply: number): number {
    return this.positions().findIndex((position) => position.ply === ply);
  }

  protected pieceLabel(piece: PromotionPiece): string {
    return { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[piece];
  }

  private boardConfig(): Config {
    return {
      fen: STARTING_FEN,
      orientation: this.orientation(),
      coordinates: true,
      disableContextMenu: true,
      animation: {
        enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        duration: 160,
      },
      movable: {
        color: undefined,
        events: { after: (from, to) => this.handleTrainingMove(from, to) },
      },
      draggable: { enabled: false },
      selectable: { enabled: false },
      drawable: {
        enabled: true,
        visible: true,
        defaultSnapToValidMove: true,
        eraseOnMovablePieceClick: false,
        onChange: (shapes) => {
          const hint = this.practiceHint();
          this.shapes = hint
            ? shapes.filter((shape) => shape.orig !== hint.orig || shape.dest !== hint.dest)
            : shapes;
        },
      },
    };
  }

  private syncBoard(): void {
    if (!this.api) return;
    if (this.mode() === 'practice') {
      this.syncPracticeBoard();
      return;
    }
    const game = this.game();
    const ply = this.currentPly();
    const move = game?.moves[ply - 1];
    const initialFen = game?.moves[0]?.fenBefore ?? STARTING_FEN;
    this.api.set({
      fen: move?.fenAfter ?? initialFen,
      orientation: this.orientation(),
      lastMove: move ? ([move.from, move.to] as [Key, Key]) : undefined,
      turnColor: move?.color === 'white' ? 'black' : 'white',
      movable: { color: undefined, dests: new Map() },
      draggable: { enabled: false },
      selectable: { enabled: false },
      drawable: { enabled: true, shapes: this.shapes },
    });
    this.api.state.dom.bounds.clear();
    this.api.redrawAll();
  }

  private syncPracticeBoard(): void {
    const position = this.activePosition();
    if (!position || !this.api) return;
    const chess = new Chess(position.fen);
    let lastMove: [Key, Key] | undefined;
    for (const move of this.practiceLine()) {
      chess.move(move);
      lastMove = [move.from as Key, move.to as Key];
    }
    const fen = chess.fen();
    const color = turnColor(fen);
    const hint = this.practiceHint();
    this.api.set({
      fen,
      orientation: this.orientation(),
      turnColor: color,
      lastMove,
      movable: {
        color,
        dests: legalDestinations(fen),
        showDests: true,
      },
      draggable: { enabled: true },
      selectable: { enabled: true },
      drawable: { enabled: true, shapes: hint ? [...this.shapes, hint] : this.shapes },
    });
    this.api.state.dom.bounds.clear();
    this.api.redrawAll();
  }

  private handleTrainingMove(from: Key, to: Key): void {
    if (this.mode() !== 'practice') return;
    const position = this.activePosition();
    if (!position) return;
    const chess = new Chess(this.practiceFen());
    const piece = chess.get(from as Square);
    const move = { from: from as Square, to: to as Square };
    if (
      piece?.type === 'p' &&
      ((piece.color === 'w' && to.endsWith('8')) || (piece.color === 'b' && to.endsWith('1')))
    ) {
      this.pendingPromotion.set(move);
      return;
    }
    this.gradeMove(move);
  }

  private gradeMove(move: MoveInput): void {
    const position = this.activePosition();
    if (!position) return;
    try {
      new Chess(this.practiceFen()).move(move);
    } catch {
      this.syncBoard();
      return;
    }
    const firstMove = this.practiceLine().length === 0;
    if (this.puzzleStatus() === 'revealed') this.shapes = [];
    this.practiceLine.update((line) => [...line, move]);
    if (firstMove) {
      this.puzzleStatus.set(moveToUci(move) === position.bestMove ? 'correct' : 'incorrect');
    }
    this.sound.play('move');
  }

  private practiceFen(): string {
    const position = this.activePosition();
    if (!position) return STARTING_FEN;
    const chess = new Chess(position.fen);
    for (const move of this.practiceLine()) chess.move(move);
    return chess.fen();
  }

  private practiceHint(): DrawShape | null {
    const position = this.activePosition();
    if (!position || this.mode() !== 'practice' || this.puzzleStatus() !== 'revealed') return null;
    const best = parseUci(position.bestMove);
    return { orig: best.from as Key, dest: best.to as Key, brush: 'green' };
  }
}

function legalDestinations(fen: string): Dests {
  const chess = new Chess(fen);
  const destinations: Dests = new Map();
  for (const move of chess.moves({ verbose: true })) {
    const from = move.from as Key;
    destinations.set(from, [...(destinations.get(from) ?? []), move.to as Key]);
  }
  return destinations;
}

function parseUci(uci: string): MoveInput {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    ...(uci[4] ? { promotion: uci[4] as PromotionPiece } : {}),
  };
}

function turnColor(fen: string): ChessColor {
  return new Chess(fen).turn() === 'w' ? 'white' : 'black';
}

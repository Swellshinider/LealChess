import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  untracked,
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
import { StockfishAnalysisEngineService } from '../../../core/engine/stockfish-analysis-engine.service';
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
  EngineEvaluation,
  GameSource,
  ImportedGame,
  MoveAnalysis,
  MoveClassification,
  PlatformPlayer,
  ReviewMoveClassification,
  TrainingPosition,
} from '../domain/coach.types';
import {
  PRACTICE_ANALYSIS_ENGINE_PORT,
  PracticeAnalysisService,
} from './practice-analysis.service';
import { PracticeMoveTreeComponent } from './practice-move-tree.component';
import {
  commitPracticeMove,
  createPracticeSession,
  practiceSessionKey,
  selectPracticeNode,
  updatePracticeNode,
} from './practice-session';
import type {
  PracticeAnalysisRequest,
  PracticeCandidateLine,
  PracticeSession,
  PracticeVariationNode,
} from './practice.types';
import { ReviewAnalysisPanelComponent } from './review-analysis-panel.component';
import {
  createGameReviewSummary,
  createMoveExplanation,
  evaluationForWhite,
  type MoveIdeaArrow,
} from './review-insights';
import { reviewSoundEvents } from './review-sound';
import { ReviewSummaryComponent } from './review-summary.component';

type ReviewMode = 'summary' | 'analysis' | 'practice';
type PuzzleStatus = 'ready' | 'incorrect' | 'correct' | 'revealed';

@Component({
  selector: 'app-review-page',
  imports: [
    ModalFocusDirective,
    PracticeMoveTreeComponent,
    ReviewAnalysisPanelComponent,
    ReviewSummaryComponent,
    RouterLink,
    SideNavigationComponent,
  ],
  providers: [
    PracticeAnalysisService,
    {
      provide: PRACTICE_ANALYSIS_ENGINE_PORT,
      useClass: StockfishAnalysisEngineService,
    },
  ],
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
  protected readonly practiceAnalysis = inject(PracticeAnalysisService);
  protected readonly coachAnalysis = inject(CoachAnalysisService);
  protected readonly game = signal<ImportedGame | null>(null);
  protected readonly loading = signal(true);
  protected readonly currentPly = signal(0);
  protected readonly orientation = signal<ChessColor>('white');
  protected readonly learnerColor = signal<ChessColor | null>(null);
  protected readonly boardTheme = signal<BoardTheme>('tournament');
  protected readonly mode = signal<ReviewMode>('summary');
  protected readonly trainingIndex = signal(0);
  protected readonly puzzleStatus = signal<PuzzleStatus>('ready');
  protected readonly pendingPromotion = signal<Omit<MoveInput, 'promotion'> | null>(null);
  private readonly practiceSessions = signal<Record<string, PracticeSession>>({});
  private readonly practiceReplayFen = signal<string | null>(null);
  protected readonly practiceReplaying = signal(false);
  protected readonly promotionPieces: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];
  protected readonly positions = computed(() => {
    const game = this.game();
    return game ? trainingPositions(game, this.coachAnalysis.analysis()) : [];
  });
  protected readonly activePosition = computed<TrainingPosition | null>(
    () => this.positions()[this.trainingIndex()] ?? null,
  );
  protected readonly activePracticeSession = computed<PracticeSession | null>(() => {
    const position = this.activePosition();
    return position ? (this.practiceSessions()[practiceSessionKey(position)] ?? null) : null;
  });
  protected readonly selectedPracticeNode = computed<PracticeVariationNode | null>(() => {
    const session = this.activePracticeSession();
    return session?.nodes[session.selectedNodeId] ?? null;
  });
  protected readonly practiceMoveCount = computed(() => {
    const session = this.activePracticeSession();
    return session ? Math.max(0, Object.keys(session.nodes).length - 1) : 0;
  });
  protected readonly practiceInputLocked = computed(
    () => this.practiceReplaying() || this.practiceAnalysis.state().phase === 'quick',
  );
  protected readonly currentAnalysis = computed<MoveAnalysis | undefined>(() =>
    moveAnalysisForPly(this.coachAnalysis.analysis(), this.currentPly()),
  );
  protected readonly reviewSummary = computed(() => {
    const game = this.game();
    return game ? createGameReviewSummary(game, this.coachAnalysis.analysis()) : null;
  });
  protected readonly moveExplanation = computed(() => {
    const game = this.game();
    return game
      ? createMoveExplanation(game, this.coachAnalysis.analysis(), this.currentPly())
      : null;
  });
  private readonly whiteEvaluationValue = computed(() => {
    if (this.mode() !== 'analysis') return null;
    const move = this.game()?.moves[this.currentPly() - 1];
    const evaluation = this.currentAnalysis()?.playedEvaluation;
    if (!move || !evaluation) return null;
    return evaluationForWhite(move, evaluation);
  });
  protected readonly evaluationRailValueLabel = computed(() => {
    const evaluation = this.currentAnalysis()?.playedEvaluation;
    if (this.mode() !== 'analysis' || !evaluation) return '';
    if (evaluation.score.kind === 'mate') return `M${Math.abs(evaluation.score.moves)}`;
    return Math.abs(this.whiteEvaluationValue() ?? 0).toFixed(1);
  });
  protected readonly evaluationFavorsWhite = computed(
    () => (this.whiteEvaluationValue() ?? 0) >= 0,
  );
  protected readonly evaluationRailLabel = computed(() => {
    const value = this.whiteEvaluationValue();
    if (value === null || Math.abs(value) < 0.05) return 'White evaluation, even';
    return `White evaluation, ${this.evaluationRailValueLabel()} favoring ${
      value > 0 ? 'White' : 'Black'
    }`;
  });
  protected readonly evaluationScoreAtTop = computed(() => {
    const whiteAtTop = this.orientation() === 'black';
    return this.evaluationFavorsWhite() === whiteAtTop;
  });
  protected readonly evaluationPercent = computed(() => {
    const whiteValue = this.whiteEvaluationValue();
    if (whiteValue === null) return 50;
    return Math.max(5, Math.min(95, 50 + 45 * Math.tanh(whiteValue / 5)));
  });
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
  private api: Api | null = null;
  private apiElement: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private replayTimers: ReturnType<typeof setTimeout>[] = [];
  private shapes: DrawShape[] = [];
  private readonly ideaShapes = signal<DrawShape[]>([]);

  constructor() {
    effect(() => {
      this.currentPly();
      this.orientation();
      this.game();
      this.mode();
      this.trainingIndex();
      this.puzzleStatus();
      this.practiceSessions();
      this.practiceReplayFen();
      this.practiceReplaying();
      this.practiceAnalysis.state();
      this.ideaShapes();
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
    effect(() => {
      const state = this.practiceAnalysis.state();
      if (!state.nodeId || (!state.result && !state.error)) return;
      untracked(() =>
        this.updateActiveSession((session) =>
          updatePracticeNode(session, state.nodeId!, {
            ...(state.result
              ? {
                  assessment: state.result.assessment,
                  candidates: state.result.candidates,
                  candidateDepth: state.result.assessment.depth,
                }
              : {}),
            analysisError: state.error,
          }),
        ),
      );
    });
  }

  async ngOnInit(): Promise<void> {
    const restored = await this.persistence.restore();
    this.sound.setEnabled(restored.preferences.soundEnabled);
    this.boardTheme.set(restored.preferences.boardTheme);
    const platform = this.route.snapshot.paramMap.get('platform') as GameSource | null;
    const gameId = this.route.snapshot.paramMap.get('gameId');
    if ((platform === 'chess-com' || platform === 'lichess' || platform === 'local') && gameId) {
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
    if (this.coachAnalysis.state().phase !== 'complete') {
      void this.analyze();
    }
  }

  ngOnDestroy(): void {
    this.coachAnalysis.cancel();
    this.clearReplayTimers();
    this.practiceAnalysis.destroy();
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
    if (this.mode() !== 'analysis' || this.pendingPromotion() || isInteractive) {
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
    this.ideaShapes.set([]);
    this.currentPly.set(nextPly);
    const traversedMove = this.game()?.moves[Math.max(previousPly, nextPly) - 1];
    if (traversedMove) {
      for (const event of reviewSoundEvents(traversedMove)) this.sound.play(event);
    }
  }

  protected startAnalysis(): void {
    if (this.coachAnalysis.state().phase !== 'complete') return;
    this.ideaShapes.set([]);
    this.mode.set('analysis');
    this.currentPly.set(this.game()?.moves.length ? 1 : 0);
  }

  protected showSummary(): void {
    this.clearReplayTimers();
    this.practiceAnalysis.cancel();
    this.pendingPromotion.set(null);
    this.practiceReplayFen.set(null);
    this.practiceReplaying.set(false);
    this.ideaShapes.set([]);
    this.currentPly.set(0);
    this.mode.set('summary');
  }

  protected showMoveIdea(): void {
    const explanation = this.moveExplanation();
    if (!explanation) return;
    const arrows = explanation.arrows.map((arrow) => this.ideaArrowShape(arrow));
    this.ideaShapes.set(arrows);
  }

  protected enterPractice(index = 0): void {
    if (!this.positions().length) return;
    this.trainingIndex.set(Math.max(0, Math.min(index, this.positions().length - 1)));
    this.puzzleStatus.set('ready');
    this.shapes = [];
    this.pendingPromotion.set(null);
    this.ideaShapes.set([]);
    this.ensureActiveSession();
    this.mode.set('practice');
    this.replayOpponentMove();
  }

  protected leavePractice(): void {
    this.clearReplayTimers();
    this.practiceAnalysis.cancel();
    this.pendingPromotion.set(null);
    this.practiceReplayFen.set(null);
    this.practiceReplaying.set(false);
    this.shapes = [];
    const position = this.activePosition();
    if (position) this.currentPly.set(position.ply);
    this.mode.set('analysis');
  }

  protected previousPosition(): void {
    if (this.trainingIndex() === 0) return;
    this.changePracticePosition(this.trainingIndex() - 1);
  }

  protected nextPosition(): void {
    if (this.trainingIndex() >= this.positions().length - 1) return;
    this.changePracticePosition(this.trainingIndex() + 1);
  }

  protected revealMove(): void {
    const session = this.activePracticeSession();
    if (!session) return;
    this.practiceAnalysis.cancel();
    this.pendingPromotion.set(null);
    this.updateActiveSession((current) => selectPracticeNode(current, current.rootId));
    this.shapes = [];
    this.puzzleStatus.set('revealed');
  }

  protected resetPractice(): void {
    const position = this.activePosition();
    if (!position) return;
    this.practiceAnalysis.cancel();
    this.pendingPromotion.set(null);
    this.practiceSessions.update((sessions) => ({
      ...sessions,
      [practiceSessionKey(position)]: createPracticeSession(position),
    }));
    this.shapes = [];
    this.puzzleStatus.set('ready');
    this.replayOpponentMove();
  }

  protected selectPracticeNode(nodeId: string): void {
    this.practiceAnalysis.cancel();
    this.pendingPromotion.set(null);
    this.practiceReplayFen.set(null);
    this.practiceReplaying.set(false);
    this.updateActiveSession((session) => selectPracticeNode(session, nodeId));
    this.puzzleStatus.set('ready');
    const node = this.selectedPracticeNode();
    if (node?.move && (!node.assessment || node.assessment.provisional)) {
      const request = this.practiceAnalysisRequest(node);
      if (request) this.practiceAnalysis.analyze(request);
    }
  }

  protected retryPracticeAnalysis(): void {
    const request = this.practiceAnalysisRequest();
    if (request) this.practiceAnalysis.retry(request);
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

  protected candidateEvaluationLabel(
    line: PracticeCandidateLine,
    fen = this.selectedPracticeNode()?.fen,
  ): string {
    if (!fen || turnColor(fen) === 'white') return this.evaluationLabel(line.evaluation);
    const score = line.evaluation.score;
    return this.evaluationLabel({
      ...line.evaluation,
      score:
        score.kind === 'mate'
          ? { kind: 'mate', moves: -score.moves }
          : { kind: 'centipawn', value: -score.value },
    });
  }

  protected candidateRuleWidth(rank: number): string {
    return `${{ 1: 14, 2: 10, 3: 6 }[rank] ?? 6}px`;
  }

  protected selectedPracticeMoveDestination(): string | null {
    return this.selectedPracticeNode()?.move?.to ?? null;
  }

  protected selectedPracticeGameOver(): boolean {
    const fen = this.selectedPracticeNode()?.fen;
    return Boolean(fen && new Chess(fen).isGameOver());
  }

  protected practiceAnalysisLabel(): string {
    const state = this.practiceAnalysis.state();
    if (state.phase === 'quick') return 'Finding a quick evaluation…';
    if (state.phase === 'refining') return 'Depth 10 · refining to depth 14';
    if (state.phase === 'complete') return 'Stockfish depth 14';
    if (state.phase === 'error' && state.result) return 'Depth 10 · refinement unavailable';
    if (state.phase === 'error') return 'Analysis unavailable';
    const node = this.selectedPracticeNode();
    return node?.candidateDepth ? `Stockfish depth ${node.candidateDepth}` : '';
  }

  protected sourceLabel(): string {
    const platform = this.game()?.platform;
    if (platform === 'chess-com') return 'Chess.com';
    if (platform === 'lichess') return 'Lichess';
    return 'LealChess';
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
      drawable: {
        enabled: true,
        shapes: this.shapes,
        autoShapes: this.mode() === 'analysis' ? this.ideaShapes() : [],
      },
    });
    this.api.state.dom.bounds.clear();
    this.api.redrawAll();
  }

  private syncPracticeBoard(): void {
    const position = this.activePosition();
    const session = this.activePracticeSession();
    const node = this.selectedPracticeNode();
    if (!position || !session || !node || !this.api) return;
    const fen = this.practiceReplayFen() ?? node.fen;
    const color = turnColor(fen);
    const hint = this.practiceHint();
    const previousOpponentMove = this.previousOpponentMove();
    const lastMove =
      this.practiceReplayFen() !== null
        ? undefined
        : node.move
          ? ([node.move.from as Key, node.move.to as Key] as [Key, Key])
          : previousOpponentMove
            ? ([previousOpponentMove.from, previousOpponentMove.to] as [Key, Key])
            : undefined;
    this.api.set({
      fen,
      orientation: this.orientation(),
      turnColor: color,
      lastMove,
      movable: {
        color: this.practiceInputLocked() ? undefined : color,
        dests: this.practiceInputLocked() ? new Map() : legalDestinations(fen),
        showDests: true,
      },
      draggable: { enabled: !this.practiceInputLocked() },
      selectable: { enabled: !this.practiceInputLocked() },
      drawable: {
        enabled: true,
        shapes: this.shapes,
        autoShapes: hint ? [hint] : this.engineCandidateShapes(node.candidates),
      },
    });
    this.api.state.dom.bounds.clear();
    this.api.redrawAll();
  }

  private ideaArrowShape(arrow: MoveIdeaArrow): DrawShape {
    return {
      orig: arrow.from as Key,
      dest: arrow.to as Key,
      brush: arrow.kind === 'best' ? 'green' : 'yellow',
      modifiers: { lineWidth: arrow.kind === 'best' ? 12 : 8 },
    };
  }

  private handleTrainingMove(from: Key, to: Key): void {
    if (this.mode() !== 'practice' || this.practiceInputLocked()) return;
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
    const session = this.activePracticeSession();
    const parent = this.selectedPracticeNode();
    if (!position || !session || !parent) return;
    try {
      new Chess(parent.fen).move(move);
    } catch {
      this.syncBoard();
      return;
    }
    const firstMove = parent.id === session.rootId;
    if (this.puzzleStatus() === 'revealed') this.shapes = [];
    const committed = commitPracticeMove(session, move);
    this.practiceSessions.update((sessions) => ({
      ...sessions,
      [session.key]: committed.session,
    }));
    if (firstMove) {
      this.puzzleStatus.set(moveToUci(move) === position.bestMove ? 'correct' : 'incorrect');
    }
    this.sound.play('move');
    if (
      committed.created ||
      !committed.node.assessment ||
      committed.node.assessment.provisional ||
      committed.node.analysisError
    ) {
      const request = this.practiceAnalysisRequest(committed.node);
      if (request) this.practiceAnalysis.analyze(request);
    }
  }

  private practiceFen(): string {
    return this.practiceReplayFen() ?? this.selectedPracticeNode()?.fen ?? STARTING_FEN;
  }

  private practiceHint(): DrawShape | null {
    const position = this.activePosition();
    const session = this.activePracticeSession();
    if (
      !position ||
      !session ||
      session.selectedNodeId !== session.rootId ||
      this.mode() !== 'practice' ||
      this.puzzleStatus() !== 'revealed'
    ) {
      return null;
    }
    const best = parseUci(position.bestMove);
    return { orig: best.from as Key, dest: best.to as Key, brush: 'green' };
  }

  private practiceAnalysisRequest(
    node = this.selectedPracticeNode(),
  ): PracticeAnalysisRequest | null {
    const session = this.activePracticeSession();
    if (!session || !node?.move || !node.san || !node.color || !node.parentId) return null;
    const parent = session.nodes[node.parentId];
    if (!parent) return null;
    return {
      nodeId: node.id,
      fenBefore: parent.fen,
      fenAfter: node.fen,
      move: node.move,
      san: node.san,
      color: node.color,
    };
  }

  private engineCandidateShapes(lines: PracticeCandidateLine[]): DrawShape[] {
    const widths = [14, 10, 6];
    return lines.map((line, index) => ({
      orig: line.firstMove.from as Key,
      dest: line.firstMove.to as Key,
      brush: 'green',
      modifiers: { lineWidth: widths[index] ?? 6 },
    }));
  }

  private ensureActiveSession(): void {
    const position = this.activePosition();
    if (!position) return;
    const key = practiceSessionKey(position);
    if (this.practiceSessions()[key]) {
      this.updateActiveSession((session) => selectPracticeNode(session, session.rootId));
      return;
    }
    this.practiceSessions.update((sessions) => ({
      ...sessions,
      [key]: createPracticeSession(position),
    }));
  }

  private changePracticePosition(index: number): void {
    this.clearReplayTimers();
    this.practiceAnalysis.cancel();
    this.trainingIndex.set(index);
    this.puzzleStatus.set('ready');
    this.pendingPromotion.set(null);
    this.shapes = [];
    this.ensureActiveSession();
    this.replayOpponentMove();
  }

  private updateActiveSession(update: (session: PracticeSession) => PracticeSession): void {
    const session = this.activePracticeSession();
    if (!session) return;
    this.practiceSessions.update((sessions) => ({
      ...sessions,
      [session.key]: update(session),
    }));
  }

  private previousOpponentMove(): ImportedGame['moves'][number] | undefined {
    const position = this.activePosition();
    return position ? this.game()?.moves[position.ply - 2] : undefined;
  }

  private replayOpponentMove(): void {
    this.clearReplayTimers();
    this.practiceAnalysis.cancel();
    const previousMove = this.previousOpponentMove();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!previousMove || reducedMotion) {
      this.practiceReplayFen.set(null);
      this.practiceReplaying.set(false);
      return;
    }
    this.practiceReplaying.set(true);
    this.practiceReplayFen.set(previousMove.fenBefore);
    this.replayTimers.push(
      setTimeout(() => {
        this.practiceReplayFen.set(null);
        for (const event of reviewSoundEvents(previousMove)) this.sound.play(event);
      }, 80),
      setTimeout(() => this.practiceReplaying.set(false), 260),
    );
  }

  private clearReplayTimers(): void {
    for (const timer of this.replayTimers.splice(0)) clearTimeout(timer);
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

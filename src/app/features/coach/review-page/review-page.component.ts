import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Chess, type Square } from 'chess.js';
import { StockfishAnalysisEngineService } from '../../../core/engine/stockfish-analysis-engine.service';
import { legalDestinations, parseUci, turnColor } from '../../../core/game/chess-move';
import { boardOverlayPosition } from '../../../shared/chess/board-overlay-position';
import { BoardFlipButtonComponent } from '../../../shared/chess/board-flip-button/board-flip-button.component';
import { ChessgroundBoardComponent } from '../../../shared/chess/chessground-board/chessground-board.component';
import type { ChessColor } from '../../../shared/chess/chess.types';
import { ModalFocusDirective } from '../../../shared/a11y/modal-focus.directive';
import { ConfirmationDialogComponent } from '../../../shared/a11y/confirmation-dialog/confirmation-dialog.component';
import { SideNavigationComponent } from '../../../shared/layout/side-navigation/side-navigation.component';
import { STARTING_FEN, type MoveInput, type PromotionPiece } from '../../../core/game/game.types';
import { SoundService } from '../../../core/sound/sound.service';
import {
  KEYBINDING_ACTIONS,
  keyChordMatches,
  type KeybindingAction,
} from '../../../core/keyboard/keybindings';
import {
  EMPTY_MOVE_TREE_NAVIGATION,
  jumpToEndNodeId,
  jumpToStartNodeId,
  nextMoveNodeId,
  previousMoveNodeId,
  rememberMoveTreeSelection,
  type MoveTreeNavigationState,
} from '../../../shared/chess/move-tree-navigation';
import { categoryLabel, moveAnalysisForPly, moveToUci } from '../analysis/analysis-rules';
import type {
  EngineEvaluation,
  ImportedGame,
  MoveAnalysis,
  MoveClassification,
  PlatformPlayer,
  ReviewMoveClassification,
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
} from './practice.types';
import { analysisCandidateArrows } from './review-analysis-arrows';
import { ReviewAnalysisPanelComponent } from './review-analysis-panel.component';
import { ReviewReplayControlsComponent } from './review-replay-controls.component';
import {
  createGameReviewSummary,
  createMoveExplanation,
  evaluationForWhite,
  type MoveIdeaArrow,
} from './review-insights';
import { reviewSoundEvents } from './review-sound';
import { ReviewSummaryComponent } from './review-summary.component';
import { ReviewPageStore } from './review-page.store';
import {
  commitReviewMove,
  removeReviewVariation,
  selectReviewNode,
  updateReviewNode,
} from './review-analysis-session';
import { ReviewAnalysisRepositoryService } from './review-analysis-repository.service';
import {
  REVIEW_LIVE_ANALYSIS_ENGINE_PORT,
  ReviewLiveAnalysisService,
} from './review-live-analysis.service';
import { AnalysisEngineSettingsComponent } from '../../../shared/analysis-engine-settings/analysis-engine-settings.component';
import { AnalysisSettingsService } from '../../../core/engine/analysis-settings.service';
import { analysisProfileFingerprint } from '../../../core/engine/analysis-profiles';
import type { ReviewCandidateLine } from './review-analysis-session.types';

@Component({
  selector: 'app-review-page',
  imports: [
    AnalysisEngineSettingsComponent,
    BoardFlipButtonComponent,
    ModalFocusDirective,
    ConfirmationDialogComponent,
    PracticeMoveTreeComponent,
    ReviewAnalysisPanelComponent,
    ReviewReplayControlsComponent,
    ReviewSummaryComponent,
    ChessgroundBoardComponent,
    RouterLink,
    SideNavigationComponent,
  ],
  providers: [
    PracticeAnalysisService,
    ReviewAnalysisRepositoryService,
    ReviewLiveAnalysisService,
    ReviewPageStore,
    {
      provide: PRACTICE_ANALYSIS_ENGINE_PORT,
      useClass: StockfishAnalysisEngineService,
    },
    {
      provide: REVIEW_LIVE_ANALYSIS_ENGINE_PORT,
      useClass: StockfishAnalysisEngineService,
    },
  ],
  templateUrl: './review-page.component.html',
  styleUrl: './review-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPageComponent implements OnInit, OnDestroy {
  private readonly analysisSettings = inject(AnalysisSettingsService);
  private readonly board = viewChild(ChessgroundBoardComponent);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly store = inject(ReviewPageStore);
  private readonly sound = inject(SoundService);
  protected readonly practiceAnalysis = this.store.practiceAnalysis;
  protected readonly coachAnalysis = this.store.coachAnalysis;
  protected readonly game = this.store.game;
  protected readonly loading = this.store.loading;
  protected readonly currentPly = this.store.currentPly;
  protected readonly orientation = this.store.orientation;
  protected readonly learnerColor = this.store.learnerColor;
  protected readonly boardTheme = this.store.boardTheme;
  protected readonly keybindings = this.store.keybindings;
  protected readonly mode = this.store.mode;
  protected readonly trainingIndex = this.store.trainingIndex;
  protected readonly puzzleStatus = this.store.puzzleStatus;
  protected readonly pendingPromotion = this.store.pendingPromotion;
  private readonly practiceSessions = this.store.practiceSessions;
  private readonly practiceReplayFen = this.store.practiceReplayFen;
  protected readonly practiceReplaying = this.store.practiceReplaying;
  protected readonly promotionPieces = this.store.promotionPieces;
  protected readonly positions = this.store.positions;
  protected readonly activePosition = this.store.activePosition;
  protected readonly activePracticeSession = this.store.activePracticeSession;
  protected readonly selectedPracticeNode = this.store.selectedPracticeNode;
  protected readonly practiceMoveCount = this.store.practiceMoveCount;
  protected readonly practiceInputLocked = this.store.practiceInputLocked;
  protected readonly reviewSession = this.store.reviewSession;
  protected readonly selectedReviewNode = this.store.selectedReviewNode;
  protected readonly confirmVariationRemovalPreference = this.store.confirmVariationRemoval;
  protected readonly pendingVariationRemoval = signal<string | null>(null);
  protected readonly skipVariationRemovalConfirmation = signal(false);
  protected readonly ideaVisible = signal(false);
  protected readonly previewedAnalysisCandidate = signal<ReviewCandidateLine | null>(null);
  protected readonly liveAnalysis = inject(ReviewLiveAnalysisService);
  protected readonly liveAnalysisStale = computed(() => {
    const node = this.selectedReviewNode();
    if (!node?.candidates.length) return false;
    const profile = this.analysisSettings.settings().profiles['live-analysis'];
    return (
      node.profileFingerprint !== analysisProfileFingerprint(profile) &&
      !(
        node.profileFingerprint === undefined &&
        profile.engineId === 'stockfish-18-full' &&
        profile.depth === 16 &&
        profile.lines === 3
      )
    );
  });
  protected readonly practiceAnalysisStale = computed(() => {
    const node = this.selectedPracticeNode();
    if (!node?.assessment) return false;
    const profile = this.analysisSettings.settings().profiles.practice;
    return (
      node.profileFingerprint !== analysisProfileFingerprint(profile) &&
      !(
        node.profileFingerprint === undefined &&
        profile.engineId === 'stockfish-18-full' &&
        profile.depth === 14 &&
        profile.lines === 3
      )
    );
  });
  protected readonly currentAnalysis = computed<MoveAnalysis | undefined>(() =>
    this.selectedReviewNode()?.source === 'imported'
      ? moveAnalysisForPly(this.coachAnalysis.analysis(), this.currentPly())
      : undefined,
  );
  protected readonly reviewSummary = computed(() => {
    const game = this.game();
    return game ? createGameReviewSummary(game, this.coachAnalysis.analysis()) : null;
  });
  protected readonly moveExplanation = computed(() => {
    const game = this.game();
    return game && this.selectedReviewNode()?.source === 'imported'
      ? createMoveExplanation(game, this.coachAnalysis.analysis(), this.currentPly())
      : null;
  });
  private readonly ideaShapes = computed<DrawShape[]>(() =>
    this.ideaVisible()
      ? (this.moveExplanation()?.arrows ?? []).map((arrow) => this.ideaArrowShape(arrow))
      : [],
  );
  private readonly whiteEvaluationValue = computed(() => {
    if (this.mode() !== 'analysis') return null;
    const selected = this.selectedReviewNode();
    const live =
      this.liveAnalysis.state().nodeId === selected?.id
        ? this.liveAnalysis.state().candidates[0]?.evaluation
        : selected?.candidates[0]?.evaluation;
    if (selected && live) {
      const score = live.score;
      const value = score.kind === 'mate' ? Math.sign(score.moves) * 100 : score.value / 100;
      return turnColor(selected.fen) === 'white' ? value : -value;
    }
    const move = this.game()?.moves[this.currentPly() - 1];
    const evaluation = this.currentAnalysis()?.playedEvaluation;
    if (!move || !evaluation) return null;
    return evaluationForWhite(move, evaluation);
  });
  protected readonly evaluationRailValueLabel = computed(() => {
    const selected = this.selectedReviewNode();
    const evaluation =
      (this.liveAnalysis.state().nodeId === selected?.id
        ? this.liveAnalysis.state().candidates[0]?.evaluation
        : selected?.candidates[0]?.evaluation) ?? this.currentAnalysis()?.playedEvaluation;
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
    if (this.mode() === 'analysis' && this.selectedReviewNode()) {
      return turnColor(this.selectedReviewNode()!.fen);
    }
    const game = this.game();
    const ply = this.currentPly();
    const fen = game?.moves[ply - 1]?.fenAfter ?? game?.moves[0]?.fenBefore ?? STARTING_FEN;
    return turnColor(fen);
  });
  private replayTimers: ReturnType<typeof setTimeout>[] = [];
  private shapes: DrawShape[] = [];
  private navigationState: MoveTreeNavigationState = EMPTY_MOVE_TREE_NAVIGATION;

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
      this.reviewSession();
      this.liveAnalysis.state();
      this.ideaShapes();
      this.previewedAnalysisCandidate();
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
                  profileFingerprint: state.result.profileFingerprint,
                }
              : {}),
            analysisError: state.error,
          }),
        ),
      );
    });
    effect(() => {
      const state = this.liveAnalysis.state();
      if (!state.nodeId || (state.phase !== 'complete' && state.phase !== 'error')) return;
      untracked(() => {
        const session = this.reviewSession();
        if (!session?.nodes[state.nodeId!]) return;
        this.reviewSession.set(
          updateReviewNode(session, state.nodeId!, {
            candidates: state.candidates,
            candidateDepth: state.depth,
            profileFingerprint: state.profileFingerprint,
            analysisError: state.error,
          }),
        );
      });
    });
  }

  async ngOnInit(): Promise<void> {
    await this.store.initialize();
    if (this.coachAnalysis.state().phase !== 'complete') {
      void this.analyze();
    }
  }

  ngOnDestroy(): void {
    this.clearReplayTimers();
    this.liveAnalysis.destroy();
    void this.store.destroy();
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
    const action = KEYBINDING_ACTIONS.find((candidate) =>
      keyChordMatches(event, this.keybindings()[candidate]),
    );
    if (!action) return;
    event.preventDefault();
    if (action === 'showIdea' && event.repeat) return;
    this.runKeybindingAction(action);
  }

  @HostListener('document:keydown.escape')
  protected cancelPromotion(): void {
    if (!this.pendingPromotion()) return;
    this.pendingPromotion.set(null);
    this.board()?.cancelMove();
    this.syncBoard();
  }

  @HostListener('document:pointerdown')
  protected unlockSound(): void {
    this.sound.unlock();
  }

  @HostListener('document:click', ['$event'])
  protected releasePointerActivatedAnalysisButton(event: MouseEvent): void {
    if (this.mode() !== 'analysis' || event.detail === 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('.review-workspace button');
    if (button instanceof HTMLElement) button.blur();
  }

  protected async analyze(): Promise<void> {
    const game = this.game();
    const color = this.learnerColor();
    if (!game || !color) return;
    await this.coachAnalysis.analyze(game, color);
  }

  protected async reanalyze(): Promise<void> {
    const game = this.game();
    const color = this.learnerColor();
    if (!game || !color) return;
    await this.coachAnalysis.reanalyze(game, color);
  }

  protected cancelAnalysis(): void {
    this.coachAnalysis.cancel();
  }

  protected goTo(ply: number): void {
    const maximum = this.game()?.moves.length ?? 0;
    const previousPly = this.currentPly();
    const nextPly = Math.max(0, Math.min(ply, maximum));
    const session = this.reviewSession();
    const importedNode = session
      ? Object.values(session.nodes).find((candidate) => candidate.importedPly === nextPly)
      : undefined;
    if (nextPly === previousPly && importedNode?.id === session?.selectedNodeId) return;
    this.currentPly.set(nextPly);
    if (importedNode) this.selectAnalysisNode(importedNode.id, false);
    const traversedMove = this.game()?.moves[Math.max(previousPly, nextPly) - 1];
    if (traversedMove) {
      for (const event of reviewSoundEvents(traversedMove)) this.sound.play(event);
    }
  }

  protected startAnalysis(): void {
    if (this.coachAnalysis.state().phase !== 'complete') return;
    this.ideaVisible.set(false);
    this.mode.set('analysis');
    this.goToImportedPly(this.game()?.moves.length ? 1 : 0);
  }

  protected showSummary(): void {
    this.clearReplayTimers();
    this.practiceAnalysis.cancel();
    this.pendingPromotion.set(null);
    this.practiceReplayFen.set(null);
    this.practiceReplaying.set(false);
    this.ideaVisible.set(false);
    this.previewedAnalysisCandidate.set(null);
    this.currentPly.set(0);
    this.mode.set('summary');
    this.liveAnalysis.cancel();
    this.navigationState = EMPTY_MOVE_TREE_NAVIGATION;
  }

  protected toggleMoveIdea(): void {
    this.ideaVisible.update((visible) => !visible);
  }

  protected enterPractice(index = 0): void {
    if (!this.positions().length) return;
    this.trainingIndex.set(Math.max(0, Math.min(index, this.positions().length - 1)));
    this.puzzleStatus.set('ready');
    this.shapes = [];
    this.pendingPromotion.set(null);
    this.ideaVisible.set(false);
    this.previewedAnalysisCandidate.set(null);
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
    this.previewedAnalysisCandidate.set(null);
    const position = this.activePosition();
    if (position) this.currentPly.set(position.ply);
    this.mode.set('analysis');
    this.goToImportedPly(position?.ply ?? 0);
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
    if (this.mode() === 'analysis') this.commitAnalysisMove({ ...pending, promotion: piece });
    else this.gradeMove({ ...pending, promotion: piece });
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
    return this.selectedReviewNode()?.source === 'imported'
      ? (this.game()?.moves[this.currentPly() - 1]?.to ?? null)
      : null;
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

  protected boardConfig(): Config {
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
        events: { after: (from, to) => this.handleBoardMove(from, to) },
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
    const board = this.board();
    if (!board) return;
    if (this.mode() === 'practice') {
      this.syncPracticeBoard();
      return;
    }
    if (this.mode() === 'analysis') {
      this.syncAnalysisBoard();
      return;
    }
    const game = this.game();
    const ply = this.currentPly();
    const move = game?.moves[ply - 1];
    const initialFen = game?.moves[0]?.fenBefore ?? STARTING_FEN;
    board.set({
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
  }

  protected selectAnalysisNode(nodeId: string, playSound = true): void {
    const session = this.reviewSession();
    const node = session?.nodes[nodeId];
    if (!session || !node) return;
    this.navigationState = rememberMoveTreeSelection(session, nodeId, this.navigationState);
    this.liveAnalysis.cancel();
    this.pendingPromotion.set(null);
    this.previewedAnalysisCandidate.set(null);
    this.reviewSession.set(selectReviewNode(session, nodeId));
    if (node.importedPly !== undefined) this.currentPly.set(node.importedPly);
    if (playSound && node.move) this.sound.play('move');
    this.analyzeSelectedReviewNode();
  }

  protected retryLiveAnalysis(): void {
    this.analyzeSelectedReviewNode(true);
  }

  protected playAnalysisCandidate(move: MoveInput): void {
    this.previewedAnalysisCandidate.set(null);
    this.commitAnalysisMove(move);
  }

  protected previewAnalysisCandidate(line: ReviewCandidateLine | null): void {
    this.previewedAnalysisCandidate.set(line);
  }

  protected removeAnalysisVariation(nodeId: string): void {
    const session = this.reviewSession();
    const node = session?.nodes[nodeId];
    if (!session || node?.source !== 'manual') return;
    if (this.confirmVariationRemovalPreference()) {
      this.pendingVariationRemoval.set(nodeId);
      return;
    }
    this.performVariationRemoval(nodeId);
  }

  protected closeVariationRemoval(): void {
    this.pendingVariationRemoval.set(null);
    this.skipVariationRemovalConfirmation.set(false);
  }

  protected confirmVariationRemoval(): void {
    const nodeId = this.pendingVariationRemoval();
    this.pendingVariationRemoval.set(null);
    if (this.skipVariationRemovalConfirmation()) {
      this.store.setConfirmVariationRemoval(false);
    }
    this.skipVariationRemovalConfirmation.set(false);
    if (nodeId) this.performVariationRemoval(nodeId);
  }

  private performVariationRemoval(nodeId: string): void {
    const session = this.reviewSession();
    const node = session?.nodes[nodeId];
    if (!session || !nodeId || node?.source !== 'manual') return;
    this.liveAnalysis.cancel();
    const next = removeReviewVariation(session, nodeId);
    this.reviewSession.set(next);
    this.analyzeSelectedReviewNode();
    requestAnimationFrame(() =>
      this.host.querySelector<HTMLButtonElement>('.score .move.current')?.focus(),
    );
  }

  private goToImportedPly(ply: number): void {
    const session = this.reviewSession();
    if (!session) return;
    const node = Object.values(session.nodes).find((candidate) => candidate.importedPly === ply);
    if (node) this.selectAnalysisNode(node.id, false);
  }

  private analyzeSelectedReviewNode(force = false): void {
    const node = this.selectedReviewNode();
    if (!node) return;
    const profile = this.analysisSettings.settings().profiles['live-analysis'];
    const fingerprint = analysisProfileFingerprint(profile);
    const current =
      node.profileFingerprint === fingerprint ||
      (node.profileFingerprint === undefined &&
        profile.engineId === 'stockfish-18-full' &&
        profile.depth === 16 &&
        profile.lines === 3);
    if (!force && node.candidates.length && !current) {
      this.liveAnalysis.state.set({
        phase: 'complete',
        nodeId: node.id,
        depth: node.candidateDepth,
        candidates: node.candidates,
        profileFingerprint: node.profileFingerprint,
      });
      return;
    }
    if (node.candidateDepth === profile.depth && current && !node.analysisError) {
      this.liveAnalysis.state.set({
        phase: 'complete',
        nodeId: node.id,
        depth: node.candidateDepth,
        candidates: node.candidates,
      });
      return;
    }
    this.liveAnalysis.analyze(node.id, node.fen);
  }

  private syncAnalysisBoard(): void {
    const node = this.selectedReviewNode();
    const board = this.board();
    if (!node || !board) return;
    const color = turnColor(node.fen);
    const candidateArrows = analysisCandidateArrows(
      node,
      this.previewedAnalysisCandidate(),
      this.liveAnalysis.state(),
    );
    board.set({
      fen: node.fen,
      orientation: this.orientation(),
      turnColor: color,
      lastMove: node.move
        ? ([node.move.from as Key, node.move.to as Key] as [Key, Key])
        : undefined,
      movable: { color, dests: legalDestinations(node.fen), showDests: true },
      draggable: { enabled: true },
      selectable: { enabled: true },
      drawable: {
        enabled: true,
        shapes: this.shapes,
        autoShapes: candidateArrows.length
          ? this.engineCandidateShapes(candidateArrows)
          : this.ideaShapes(),
      },
    });
  }

  private handleBoardMove(from: Key, to: Key): void {
    if (this.mode() === 'analysis') {
      const node = this.selectedReviewNode();
      if (!node) return;
      const piece = new Chess(node.fen).get(from as Square);
      const move = { from: from as Square, to: to as Square };
      if (
        piece?.type === 'p' &&
        ((piece.color === 'w' && to.endsWith('8')) || (piece.color === 'b' && to.endsWith('1')))
      ) {
        this.pendingPromotion.set(move);
        return;
      }
      this.commitAnalysisMove(move);
      return;
    }
    this.handleTrainingMove(from, to);
  }

  private commitAnalysisMove(move: MoveInput): void {
    const session = this.reviewSession();
    const parent = this.selectedReviewNode();
    if (!session || !parent) return;
    try {
      new Chess(parent.fen).move(move);
      const committed = commitReviewMove(session, move);
      this.reviewSession.set(committed.session);
      this.navigationState = rememberMoveTreeSelection(
        committed.session,
        committed.node.id,
        this.navigationState,
      );
      if (committed.node.source === 'imported') {
        this.currentPly.set(committed.node.importedPly ?? committed.node.ply);
      }
      this.sound.play('move');
      this.analyzeSelectedReviewNode();
    } catch {
      this.syncBoard();
    }
  }

  private runKeybindingAction(action: KeybindingAction): void {
    if (action === 'showIdea') {
      this.toggleMoveIdea();
      return;
    }
    const session = this.reviewSession();
    if (!session) return;
    const selectedId = session.selectedNodeId;
    if (action === 'previousMove') {
      const destination = previousMoveNodeId(session, selectedId);
      if (destination) this.selectAnalysisNode(destination);
      return;
    }
    if (action === 'nextMove') {
      const destination = nextMoveNodeId(session, selectedId, this.navigationState);
      if (destination) this.selectAnalysisNode(destination);
      return;
    }
    const jump =
      action === 'branchStart'
        ? jumpToStartNodeId(session, selectedId, this.navigationState)
        : jumpToEndNodeId(session, selectedId, this.navigationState);
    if (jump.nodeId !== selectedId) this.selectAnalysisNode(jump.nodeId);
    this.navigationState = jump.state;
  }

  private syncPracticeBoard(): void {
    const position = this.activePosition();
    const session = this.activePracticeSession();
    const node = this.selectedPracticeNode();
    const board = this.board();
    if (!position || !session || !node || !board) return;
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
    board.set({
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
    if (!best) return null;
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

  private engineCandidateShapes(
    lines: Array<PracticeCandidateLine | ReviewCandidateLine>,
  ): DrawShape[] {
    return lines.map((line) => this.engineCandidateShape(line));
  }

  private engineCandidateShape(line: PracticeCandidateLine | ReviewCandidateLine): DrawShape {
    return {
      orig: line.firstMove.from as Key,
      dest: line.firstMove.to as Key,
      brush: 'green',
      modifiers: { lineWidth: { 1: 14, 2: 9, 3: 5 }[line.rank] ?? 6 },
    };
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

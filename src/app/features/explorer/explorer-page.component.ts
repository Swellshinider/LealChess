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
import type { OnDestroy, OnInit } from '@angular/core';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { StockfishAnalysisEngineService } from '../../core/engine/stockfish-analysis-engine.service';
import { legalDestinations } from '../../core/game/chess-move';
import { STARTING_FEN, type MoveInput, type PromotionPiece } from '../../core/game/game.types';
import type { ChessColor } from '../../shared/chess/chess.types';
import { BoardFlipButtonComponent } from '../../shared/chess/board-flip-button/board-flip-button.component';
import { ChessgroundBoardComponent } from '../../shared/chess/chessground-board/chessground-board.component';
import { ModalFocusDirective } from '../../shared/a11y/modal-focus.directive';
import { ConfirmationDialogComponent } from '../../shared/a11y/confirmation-dialog/confirmation-dialog.component';
import { SideNavigationComponent } from '../../shared/layout/side-navigation/side-navigation.component';
import {
  EXPLORER_ANALYSIS_ENGINE_PORT,
  ExplorerAnalysisService,
} from './explorer-analysis.service';
import {
  compatibleEnPassantSquares,
  parseExplorerFen,
  parseExplorerPgn,
  setupStateFromFen,
  setupStateToFen,
} from './explorer-position';
import { ExplorerRepositoryService } from './explorer-repository.service';
import { ExplorerPageStore } from './explorer-page.store';
import {
  commitExplorerMove,
  createExplorerSession,
  createPgnExplorerSession,
  explorerAncestorIds,
  importedExplorerNodes,
  moveNumberLabel,
  selectExplorerNode,
  updateExplorerNode,
} from './explorer-session';
import type {
  ExplorerCandidateLine,
  ExplorerMoveAnalysisRequest,
  ExplorerMoveNode,
  ExplorerSession,
  ExplorerSetupState,
} from './explorer.types';

type ExplorerMode = 'analysis' | 'setup';
type ImportTab = 'fen' | 'pgn';
type AnalysisKind = 'idle' | 'position' | 'move' | 'batch';
type SetupTool = { color: 'w' | 'b'; type: PieceSymbol } | 'erase';
type ReplacementContext = 'import' | 'new-analysis' | 'setup';

interface PendingSessionReplacement {
  session: ExplorerSession;
  context: ReplacementContext;
}

interface TreeRow {
  node: ExplorerMoveNode;
  depth: number;
  onSelectedLine: boolean;
}

@Component({
  selector: 'app-explorer-page',
  imports: [
    BoardFlipButtonComponent,
    ChessgroundBoardComponent,
    ConfirmationDialogComponent,
    ModalFocusDirective,
    SideNavigationComponent,
  ],
  providers: [
    ExplorerAnalysisService,
    ExplorerRepositoryService,
    ExplorerPageStore,
    {
      provide: EXPLORER_ANALYSIS_ENGINE_PORT,
      useClass: StockfishAnalysisEngineService,
    },
  ],
  templateUrl: './explorer-page.component.html',
  styleUrl: './explorer-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerPageComponent implements OnInit, OnDestroy {
  private readonly board = viewChild(ChessgroundBoardComponent);
  private readonly store = inject(ExplorerPageStore);
  private readonly analysis = inject(ExplorerAnalysisService);

  protected readonly session = this.store.session;
  protected readonly mode = signal<ExplorerMode>('analysis');
  protected readonly loading = this.store.loading;
  protected readonly importOpen = signal(false);
  protected readonly importTab = signal<ImportTab>('fen');
  protected readonly importValue = signal('');
  protected readonly importError = signal<string | null>(null);
  protected readonly pendingSessionReplacement = signal<PendingSessionReplacement | null>(null);
  protected readonly analysisKind = signal<AnalysisKind>('idle');
  protected readonly analysisMessage = signal('Preparing the board');
  protected readonly pendingPromotion = signal<Omit<MoveInput, 'promotion'> | null>(null);
  protected readonly setup = signal<ExplorerSetupState>(setupStateFromFen(STARTING_FEN));
  protected readonly setupTool = signal<SetupTool>({ color: 'w', type: 'q' });
  protected readonly setupError = signal<string | null>(null);
  protected readonly boardTheme = this.store.boardTheme;
  protected readonly promotionPieces: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];
  protected readonly pieceTypes: readonly PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];
  protected readonly setupColors: readonly ['w', 'b'] = ['w', 'b'];

  protected readonly selectedNode = computed(
    () => this.session().nodes[this.session().selectedNodeId]!,
  );
  protected readonly currentFen = computed(() =>
    this.mode() === 'setup' ? setupStateToFen(this.setup()) : this.selectedNode().fen,
  );
  protected readonly turn = computed<ChessColor>(() =>
    this.currentFen().split(' ')[1] === 'b' ? 'black' : 'white',
  );
  protected readonly treeRows = computed(() => flattenTree(this.session()));
  protected readonly selectedCandidates = computed(() => this.selectedNode().candidates);
  protected readonly setupFen = computed(() => setupStateToFen(this.setup()));
  protected readonly enPassantSquares = computed(() =>
    compatibleEnPassantSquares(this.setup().turn),
  );
  protected readonly setupValid = computed(() => parseExplorerFen(this.setupFen()).ok);
  private readonly whiteEvaluationValue = computed(() => {
    const evaluation = this.selectedCandidates()[0]?.evaluation;
    if (!evaluation) return null;
    const value =
      evaluation.score.kind === 'mate'
        ? evaluation.score.moves > 0
          ? 1200
          : -1200
        : evaluation.score.value;
    return this.turn() === 'white' ? value : -value;
  });
  protected readonly evaluationLabel = computed(() => {
    const evaluation = this.selectedCandidates()[0]?.evaluation;
    if (!evaluation) return '';
    if (evaluation.score.kind === 'mate') return `M${Math.abs(evaluation.score.moves)}`;
    return (Math.abs(this.whiteEvaluationValue() ?? 0) / 100).toFixed(1);
  });
  protected readonly evaluationFavorsWhite = computed(
    () => (this.whiteEvaluationValue() ?? 0) >= 0,
  );
  protected readonly evaluationScoreAtTop = computed(() => {
    const whiteAtTop = this.session().orientation === 'black';
    return this.evaluationFavorsWhite() === whiteAtTop;
  });
  protected readonly evaluationPercent = computed(() => {
    const whiteValue = this.whiteEvaluationValue();
    if (whiteValue === null) return 50;
    return Math.max(5, Math.min(95, 50 + 45 * Math.tanh(whiteValue / 500)));
  });
  protected readonly batchProgress = computed(() => {
    const batch = this.session().batch;
    return batch.total ? Math.round((batch.completed / batch.total) * 100) : 100;
  });
  protected readonly gameOverLabel = computed(() => {
    const chess = new Chess(this.selectedNode().fen);
    if (chess.isCheckmate()) return 'Checkmate';
    if (chess.isStalemate()) return 'Stalemate';
    if (chess.isDraw()) return 'Draw';
    return null;
  });

  private activeAbort: AbortController | null = null;
  private activeKind: AnalysisKind = 'idle';
  private analysisTicket = 0;
  private destroyed = false;

  constructor() {
    effect(() => {
      this.session();
      this.mode();
      this.setup();
      this.syncBoard();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.store.initialize();
    this.requestInteractiveAnalysis();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.analysisTicket += 1;
    this.activeAbort?.abort();
    void this.store.destroy();
    this.analysis.destroy();
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.pendingPromotion()) {
        this.cancelPromotion();
      } else if (this.importOpen()) {
        this.closeImport();
      }
      return;
    }
    if (this.mode() !== 'analysis' || isInteractiveTarget(event.target)) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.selectParent();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.selectPrimaryChild();
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.selectNode(this.session().rootId);
    }
  }

  protected openImport(tab: ImportTab = 'fen'): void {
    this.importTab.set(tab);
    this.importValue.set('');
    this.importError.set(null);
    this.importOpen.set(true);
  }

  protected closeImport(): void {
    this.importOpen.set(false);
    this.importError.set(null);
  }

  protected chooseImportTab(tab: ImportTab): void {
    this.importTab.set(tab);
    this.importValue.set('');
    this.importError.set(null);
  }

  protected updateImportValue(event: Event): void {
    this.importValue.set((event.target as HTMLTextAreaElement).value);
  }

  protected applyImport(): void {
    if (this.importTab() === 'fen') {
      const result = parseExplorerFen(this.importValue());
      if (!result.ok || !result.fen) {
        this.importError.set(result.error ?? 'Enter a valid FEN.');
        return;
      }
      this.requestSessionReplacement(createExplorerSession(result.fen, 'fen'), 'import');
    } else {
      const result = parseExplorerPgn(this.importValue());
      if (!result.ok || !result.rootFen || !result.moves) {
        this.importError.set(result.error ?? 'Enter a valid PGN.');
        return;
      }
      this.requestSessionReplacement(
        createPgnExplorerSession(result.rootFen, result.moves),
        'import',
      );
    }
  }

  protected newAnalysis(): void {
    this.requestSessionReplacement(createExplorerSession(), 'new-analysis');
  }

  protected enterSetup(): void {
    this.interruptAnalysis();
    this.setup.set(setupStateFromFen(this.selectedNode().fen));
    this.setupError.set(null);
    this.mode.set('setup');
  }

  protected cancelSetup(): void {
    this.mode.set('analysis');
    this.requestInteractiveAnalysis();
  }

  protected useSetupPosition(): void {
    const result = parseExplorerFen(this.setupFen());
    if (!result.ok || !result.fen) {
      this.setupError.set(result.error ?? 'Complete the position before analyzing it.');
      return;
    }
    this.requestSessionReplacement(createExplorerSession(result.fen, 'setup'), 'setup');
  }

  protected closeSessionReplacement(): void {
    const pending = this.pendingSessionReplacement();
    this.pendingSessionReplacement.set(null);
    if (pending?.context === 'import') this.importOpen.set(true);
  }

  protected confirmSessionReplacement(): void {
    const pending = this.pendingSessionReplacement();
    this.pendingSessionReplacement.set(null);
    if (pending) this.applySessionReplacement(pending);
  }

  protected clearSetup(): void {
    const state = this.setup();
    this.setup.set({ ...state, pieces: {}, castling: emptyCastling(), enPassant: '-' });
  }

  protected resetSetup(): void {
    this.setup.set(setupStateFromFen(STARTING_FEN));
    this.setupError.set(null);
  }

  protected selectSetupTool(tool: SetupTool): void {
    this.setupTool.set(tool);
  }

  protected pieceSymbol(color: 'w' | 'b', piece: PieceSymbol): string {
    return PIECE_SYMBOLS[`${color}${piece}`]!;
  }

  protected setupToolSelected(color: 'w' | 'b', piece: PieceSymbol): boolean {
    const selected = this.setupTool();
    return selected !== 'erase' && selected.color === color && selected.type === piece;
  }

  protected handleBoardClick(event: MouseEvent): void {
    const board = this.board();
    if (this.mode() !== 'setup' || !board) return;
    const target = event.target as HTMLElement;
    if (target.closest('piece') && this.setupTool() !== 'erase') return;
    const square = squareAtPoint(
      event.clientX,
      event.clientY,
      board.bounds(),
      this.session().orientation,
    );
    if (!square) return;
    const state = this.setup();
    const pieces = { ...state.pieces };
    const tool = this.setupTool();
    if (tool === 'erase') delete pieces[square];
    else pieces[square] = tool;
    this.setup.set({ ...state, pieces });
  }

  protected updateSetupTurn(event: Event): void {
    const turn = (event.target as HTMLSelectElement).value as 'w' | 'b';
    this.setup.update((state) => ({ ...state, turn, enPassant: '-' }));
  }

  protected updateEnPassant(event: Event): void {
    const enPassant = (event.target as HTMLSelectElement).value as '-' | Square;
    this.setup.update((state) => ({ ...state, enPassant }));
  }

  protected updateCastling(right: keyof ExplorerSetupState['castling'], event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.setup.update((state) => ({
      ...state,
      castling: { ...state.castling, [right]: checked },
    }));
  }

  protected flipBoard(): void {
    this.session.update((session) => ({
      ...session,
      orientation: session.orientation === 'white' ? 'black' : 'white',
      updatedAt: new Date().toISOString(),
    }));
  }

  protected selectNode(nodeId: string): void {
    if (nodeId === this.session().selectedNodeId) return;
    this.session.update((session) => selectExplorerNode(session, nodeId));
    this.pendingPromotion.set(null);
    this.requestInteractiveAnalysis();
  }

  protected selectParent(): void {
    const parentId = this.selectedNode().parentId;
    if (parentId) this.selectNode(parentId);
  }

  protected selectPrimaryChild(): void {
    const childId = this.selectedNode().children[0];
    if (childId) this.selectNode(childId);
  }

  protected choosePromotion(piece: PromotionPiece): void {
    const pending = this.pendingPromotion();
    if (!pending) return;
    this.pendingPromotion.set(null);
    this.commitMove({ ...pending, promotion: piece });
  }

  protected cancelPromotion(): void {
    this.pendingPromotion.set(null);
    this.board()?.cancelMove();
    this.syncBoard();
  }

  protected classificationLabel(classification?: string): string {
    return classification
      ? classification.charAt(0).toUpperCase() + classification.slice(1)
      : 'Analyzing';
  }

  protected moveNumber(node: ExplorerMoveNode): string {
    const parent = node.parentId ? this.session().nodes[node.parentId] : undefined;
    return parent ? moveNumberLabel(parent.fen) : '';
  }

  protected candidateEvaluation(line: ExplorerCandidateLine): string {
    return formatEvaluation(line.evaluation, this.turn());
  }

  protected pauseBatch(): void {
    if (this.session().batch.status !== 'running') return;
    this.session.update((session) => ({
      ...session,
      batch: { ...session.batch, status: 'paused' },
      updatedAt: new Date().toISOString(),
    }));
    if (this.activeKind === 'batch') this.interruptAnalysis();
  }

  protected resumeBatch(): void {
    this.session.update((session) => ({
      ...session,
      batch: { ...session.batch, status: 'running', error: undefined },
      updatedAt: new Date().toISOString(),
    }));
    if (!this.activeAbort) this.runBatchAnalysis();
  }

  protected retrySelected(): void {
    this.session.update((session) =>
      updateExplorerNode(session, session.selectedNodeId, { analysisError: undefined }),
    );
    this.requestInteractiveAnalysis();
  }

  protected boardConfig(): Config {
    return {
      fen: STARTING_FEN,
      orientation: 'white',
      coordinates: true,
      disableContextMenu: true,
      animation: {
        enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        duration: 160,
      },
      movable: {
        free: false,
        color: 'white',
        showDests: true,
        events: { after: (from, to) => this.handleBoardMove(from, to) },
      },
      draggable: { enabled: true, showGhost: true },
      selectable: { enabled: true },
      drawable: {
        enabled: true,
        visible: true,
        defaultSnapToValidMove: true,
        eraseOnMovablePieceClick: false,
      },
    };
  }

  private syncBoard(): void {
    const board = this.board();
    if (!board) return;
    if (this.mode() === 'setup') {
      board.set({
        fen: this.setupFen(),
        orientation: this.session().orientation,
        turnColor: this.setup().turn === 'w' ? 'white' : 'black',
        lastMove: undefined,
        movable: { free: true, color: 'both', dests: new Map() },
        draggable: { enabled: true },
        selectable: { enabled: true },
        drawable: { enabled: false, shapes: [], autoShapes: [] },
      });
    } else {
      const node = this.selectedNode();
      const chess = new Chess(node.fen);
      const color = chess.turn() === 'w' ? 'white' : 'black';
      const movable = !chess.isGameOver();
      board.set({
        fen: node.fen,
        orientation: this.session().orientation,
        turnColor: color,
        check: chess.inCheck() ? color : false,
        lastMove: node.move ? ([node.move.from, node.move.to] as [Key, Key]) : undefined,
        movable: {
          free: false,
          color: movable ? color : undefined,
          dests: movable ? legalDestinations(node.fen) : new Map(),
          showDests: true,
        },
        draggable: { enabled: movable },
        selectable: { enabled: movable },
        drawable: {
          enabled: true,
          autoShapes: candidateShapes(node.candidates),
        },
      });
    }
  }

  private handleBoardMove(from: Key, to: Key): void {
    if (this.mode() === 'setup') {
      const state = this.setup();
      const pieces = { ...state.pieces };
      const piece = pieces[from as Square];
      delete pieces[from as Square];
      if (piece) pieces[to as Square] = piece;
      this.setup.set({ ...state, pieces });
      return;
    }
    const chess = new Chess(this.selectedNode().fen);
    const piece = chess.get(from as Square);
    const move = { from: from as Square, to: to as Square };
    if (
      piece?.type === 'p' &&
      ((piece.color === 'w' && to.endsWith('8')) || (piece.color === 'b' && to.endsWith('1')))
    ) {
      this.pendingPromotion.set(move);
      return;
    }
    this.commitMove(move);
  }

  private commitMove(move: MoveInput): void {
    try {
      const committed = commitExplorerMove(this.session(), move);
      this.session.set(committed.session);
      this.store.save(committed.session);
      this.requestInteractiveAnalysis();
    } catch {
      this.syncBoard();
    }
  }

  private replaceSession(session: ExplorerSession): void {
    this.interruptAnalysis();
    this.session.set(session);
    this.store.save(session);
    this.requestInteractiveAnalysis();
  }

  private requestSessionReplacement(session: ExplorerSession, context: ReplacementContext): void {
    const pending = { session, context };
    if (Object.keys(this.session().nodes).length <= 1) {
      this.applySessionReplacement(pending);
      return;
    }
    if (context === 'import') this.importOpen.set(false);
    this.pendingSessionReplacement.set(pending);
  }

  private applySessionReplacement(pending: PendingSessionReplacement): void {
    if (pending.context === 'setup') this.mode.set('analysis');
    if (pending.context === 'import') this.closeImport();
    this.replaceSession(pending.session);
  }

  private requestInteractiveAnalysis(): void {
    if (this.mode() !== 'analysis' || this.loading() || this.destroyed) return;
    const ticket = ++this.analysisTicket;
    this.activeAbort?.abort();
    const controller = new AbortController();
    this.activeAbort = controller;
    this.activeKind = 'position';
    this.analysisKind.set('position');
    this.analysisMessage.set('Reading the position');
    const nodeId = this.session().selectedNodeId;
    void this.runInteractiveAnalysis(nodeId, ticket, controller);
  }

  private async runInteractiveAnalysis(
    nodeId: string,
    ticket: number,
    controller: AbortController,
  ): Promise<void> {
    try {
      const node = this.session().nodes[nodeId];
      if (!node) return;
      if (node.move && (!node.assessment || node.assessment.provisional)) {
        this.activeKind = 'move';
        this.analysisKind.set('move');
        this.analysisMessage.set(`Grading ${node.san}`);
        const request = this.analysisRequest(node);
        if (request) {
          if (!node.assessment) {
            const quick = await this.analysis.assessMove(request, 10, controller.signal);
            if (!this.isCurrent(ticket)) return;
            this.session.update((session) =>
              updateExplorerNode(session, nodeId, { assessment: quick, analysisError: undefined }),
            );
          }
          const refined = await this.analysis.assessMove(request, 14, controller.signal);
          if (!this.isCurrent(ticket)) return;
          this.session.update((session) =>
            updateExplorerNode(session, nodeId, { assessment: refined, analysisError: undefined }),
          );
        }
      }

      const current = this.session().nodes[nodeId];
      if (!current || new Chess(current.fen).isGameOver()) return;
      this.activeKind = 'position';
      this.analysisKind.set('position');
      this.analysisMessage.set('Calculating three best lines');
      if ((current.candidateDepth ?? 0) < 10) {
        const quickLines = await this.analysis.candidates(current.fen, 10, controller.signal);
        if (!this.isCurrent(ticket)) return;
        this.session.update((session) =>
          updateExplorerNode(session, nodeId, {
            candidates: quickLines,
            candidateDepth: 10,
            analysisError: undefined,
          }),
        );
      }
      if ((this.session().nodes[nodeId]?.candidateDepth ?? 0) < 14) {
        const refinedLines = await this.analysis.candidates(current.fen, 14, controller.signal);
        if (!this.isCurrent(ticket)) return;
        this.session.update((session) =>
          updateExplorerNode(session, nodeId, {
            candidates: refinedLines,
            candidateDepth: 14,
            analysisError: undefined,
          }),
        );
      }
    } catch (error) {
      if (!isAbort(error) && this.isCurrent(ticket)) {
        this.session.update((session) =>
          updateExplorerNode(session, nodeId, {
            analysisError:
              error instanceof Error ? error.message : 'Stockfish could not analyze this position.',
          }),
        );
      }
    } finally {
      if (this.isCurrent(ticket) && this.activeAbort === controller) {
        this.activeAbort = null;
        this.activeKind = 'idle';
        this.analysisKind.set('idle');
        this.analysisMessage.set('Analysis ready');
        this.runBatchAnalysis();
      }
    }
  }

  private runBatchAnalysis(): void {
    if (
      this.destroyed ||
      this.mode() !== 'analysis' ||
      this.activeAbort ||
      this.session().batch.status !== 'running'
    ) {
      return;
    }
    const remaining = importedExplorerNodes(this.session()).filter(
      (node) => !node.assessment || node.assessment.provisional,
    );
    if (!remaining.length) {
      this.session.update((session) => ({
        ...session,
        batch: { ...session.batch, status: 'complete', completed: session.batch.total },
        updatedAt: new Date().toISOString(),
      }));
      return;
    }
    const ticket = ++this.analysisTicket;
    const controller = new AbortController();
    this.activeAbort = controller;
    this.activeKind = 'batch';
    this.analysisKind.set('batch');
    void this.runBatch(remaining, ticket, controller);
  }

  private async runBatch(
    nodes: ExplorerMoveNode[],
    ticket: number,
    controller: AbortController,
  ): Promise<void> {
    try {
      for (const queuedNode of nodes) {
        if (!this.isCurrent(ticket) || this.session().batch.status !== 'running') return;
        const node = this.session().nodes[queuedNode.id];
        if (!node || (node.assessment && !node.assessment.provisional)) continue;
        this.analysisMessage.set(
          `Analyzing move ${Math.min(this.session().batch.completed + 1, this.session().batch.total)} of ${this.session().batch.total}`,
        );
        const request = this.analysisRequest(node);
        if (!request) continue;
        const assessment = await this.analysis.assessMove(request, 14, controller.signal);
        if (!this.isCurrent(ticket)) return;
        this.session.update((session) => {
          const updated = updateExplorerNode(session, node.id, {
            assessment,
            analysisError: undefined,
          });
          const completed = importedExplorerNodes(updated).filter(
            (candidate) => candidate.assessment && !candidate.assessment.provisional,
          ).length;
          return {
            ...updated,
            batch: { ...updated.batch, completed },
            updatedAt: new Date().toISOString(),
          };
        });
      }
      if (this.isCurrent(ticket)) {
        this.session.update((session) => ({
          ...session,
          batch: { ...session.batch, status: 'complete', completed: session.batch.total },
          updatedAt: new Date().toISOString(),
        }));
      }
    } catch (error) {
      if (!isAbort(error) && this.isCurrent(ticket)) {
        this.session.update((session) => ({
          ...session,
          batch: {
            ...session.batch,
            status: 'error',
            error: error instanceof Error ? error.message : 'PGN analysis failed.',
          },
          updatedAt: new Date().toISOString(),
        }));
      }
    } finally {
      if (this.isCurrent(ticket) && this.activeAbort === controller) {
        this.activeAbort = null;
        this.activeKind = 'idle';
        this.analysisKind.set('idle');
        this.analysisMessage.set('Analysis ready');
      }
    }
  }

  private analysisRequest(node: ExplorerMoveNode): ExplorerMoveAnalysisRequest | null {
    if (!node.parentId || !node.move || !node.san || !node.color) return null;
    const parent = this.session().nodes[node.parentId];
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

  private interruptAnalysis(): void {
    this.analysisTicket += 1;
    this.activeAbort?.abort();
    this.activeAbort = null;
    this.activeKind = 'idle';
    this.analysisKind.set('idle');
  }

  private isCurrent(ticket: number): boolean {
    return ticket === this.analysisTicket && !this.destroyed;
  }
}

const PIECE_SYMBOLS: Record<string, string> = {
  wk: '\u2654',
  wq: '\u2655',
  wr: '\u2656',
  wb: '\u2657',
  wn: '\u2658',
  wp: '\u2659',
  bk: '\u265a',
  bq: '\u265b',
  br: '\u265c',
  bb: '\u265d',
  bn: '\u265e',
  bp: '\u265f',
};

function emptyCastling(): ExplorerSetupState['castling'] {
  return {
    whiteKing: false,
    whiteQueen: false,
    blackKing: false,
    blackQueen: false,
  };
}

function candidateShapes(lines: ExplorerCandidateLine[]): DrawShape[] {
  const widths = [14, 9, 5];
  return lines.map((line, index) => ({
    orig: line.firstMove.from as Key,
    dest: line.firstMove.to as Key,
    brush: 'green',
    modifiers: { lineWidth: widths[index] ?? 5 },
  }));
}

function flattenTree(session: ExplorerSession): TreeRow[] {
  const selectedLine = explorerAncestorIds(session, session.selectedNodeId);
  const rows: TreeRow[] = [];
  const visit = (parentId: string, depth: number) => {
    for (const childId of session.nodes[parentId]?.children ?? []) {
      const node = session.nodes[childId];
      if (!node) continue;
      rows.push({ node, depth, onSelectedLine: selectedLine.has(node.id) });
      visit(node.id, depth + 1);
    }
  };
  visit(session.rootId, 0);
  return rows;
}

function formatEvaluation(
  evaluation: ExplorerCandidateLine['evaluation'],
  turn: ChessColor,
): string {
  const sign = turn === 'white' ? 1 : -1;
  if (evaluation.score.kind === 'mate') {
    const moves = evaluation.score.moves * sign;
    return `${moves < 0 ? '−' : '+'}M${Math.abs(moves)}`;
  }
  const pawns = (evaluation.score.value * sign) / 100;
  return `${pawns >= 0 ? '+' : '−'}${Math.abs(pawns).toFixed(2)}`;
}

function squareAtPoint(
  clientX: number,
  clientY: number,
  bounds: DOMRect,
  orientation: ChessColor,
): Square | null {
  if (
    clientX < bounds.left ||
    clientX > bounds.right ||
    clientY < bounds.top ||
    clientY > bounds.bottom
  ) {
    return null;
  }
  let file = Math.min(7, Math.floor(((clientX - bounds.left) / bounds.width) * 8));
  let rank = Math.min(7, Math.floor(((clientY - bounds.top) / bounds.height) * 8));
  if (orientation === 'black') {
    file = 7 - file;
    rank = 7 - rank;
  }
  return `${'abcdefgh'[file]}${8 - rank}` as Square;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('button, a, input, select, textarea, [role="dialog"]'))
  );
}

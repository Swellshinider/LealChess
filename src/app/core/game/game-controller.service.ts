import { Injectable, inject, signal, type Signal } from '@angular/core';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { ENGINE_PORT } from '../engine/engine.types';
import {
  PERSISTENCE_PORT,
  PERSISTENCE_SCHEMA_VERSION,
  type PersistedGame,
} from '../persistence/persistence.types';
import { SoundService, type SoundEvent } from '../sound/sound.service';
import {
  DEFAULT_PREFERENCES,
  type ChessColor,
  type DifficultyId,
  type GamePreferences,
  type GameResult,
  type GameViewState,
  type MoveInput,
  type MoveRecord,
  type PendingPremove,
  type StartGameOptions,
} from './game.types';

const EMPTY_GAME_ID = 'setup';

@Injectable({ providedIn: 'root' })
export class GameController {
  private readonly engine = inject(ENGINE_PORT);
  private readonly persistence = inject(PERSISTENCE_PORT);
  private readonly sound = inject(SoundService);
  private chess = new Chess();
  private requestId = 0;
  private initialization: Promise<void> | null = null;
  private readonly mutableState = signal<GameViewState>(this.buildState());

  readonly state: Signal<GameViewState> = this.mutableState.asReadonly();

  initialize(): Promise<void> {
    this.initialization ??= this.initializeApplication();
    return this.initialization;
  }

  async startGame(options: StartGameOptions): Promise<void> {
    await this.invalidateSearch();
    const playerColor = this.chooseColor(options.colorSelection);
    this.chess = new Chess();
    this.chess.setHeader('Event', 'LealChess bot game');
    this.chess.setHeader('White', playerColor === 'white' ? 'Player' : 'Stockfish');
    this.chess.setHeader('Black', playerColor === 'black' ? 'Player' : 'Stockfish');
    this.chess.setHeader('Result', '*');

    const preferences = {
      ...this.mutableState().preferences,
      difficulty: options.difficulty,
      orientation: playerColor,
    };
    this.sound.setEnabled(preferences.soundEnabled);
    this.mutableState.set(
      this.buildState({
        gameId: crypto.randomUUID(),
        phase: 'active',
        engineStatus: this.mutableState().engineStatus === 'error' ? 'loading' : 'ready',
        engineError: null,
        playerColor,
        orientation: playerColor,
        difficulty: options.difficulty,
        preferences,
        announcement: `New game. You are playing ${playerColor}.`,
      }),
    );
    await this.persistence.savePreferences(preferences);

    try {
      await this.engine.initialize();
      await this.engine.newGame(options.difficulty);
      this.patchState({ engineStatus: 'ready', engineError: null });
      await this.persistGame();
      if (playerColor === 'black') {
        await this.requestEngineMove();
      }
    } catch (error) {
      this.setEngineError(error);
    }
  }

  async makePlayerMove(input: MoveInput): Promise<boolean> {
    const state = this.mutableState();
    if (state.phase !== 'active' || state.result || !state.isPlayerTurn) {
      return false;
    }

    const move = this.tryMove(input);
    if (!move) {
      this.patchState({ announcement: 'That move is not legal.' });
      return false;
    }

    this.playMoveSound(move);
    this.publishPosition({ announcement: this.describeMove(move) });
    await this.afterCommittedMove();
    return true;
  }

  queuePremove(input: MoveInput): boolean {
    const state = this.mutableState();
    if (
      state.phase !== 'active' ||
      state.result ||
      state.isPlayerTurn ||
      !state.preferences.premovesEnabled
    ) {
      return false;
    }

    const piece = this.chess.get(input.from);
    if (!piece || this.toColor(piece.color) !== state.playerColor || input.from === input.to) {
      return false;
    }

    const pendingPremove: PendingPremove = {
      ...input,
      positionFen: this.chess.fen(),
    };
    this.patchState({
      pendingPremove,
      announcement: `Premove queued from ${input.from} to ${input.to}.`,
    });
    void this.persistGame();
    return true;
  }

  cancelPremove(announcement = 'Premove cancelled.'): void {
    if (!this.mutableState().pendingPremove) {
      return;
    }
    this.patchState({ pendingPremove: null, announcement });
    void this.persistGame();
  }

  async requestEngineMove(): Promise<void> {
    const before = this.mutableState();
    if (
      before.phase !== 'active' ||
      before.result ||
      this.toColor(this.chess.turn()) === before.playerColor
    ) {
      return;
    }

    const request = {
      gameId: before.gameId,
      requestId: ++this.requestId,
      fen: this.chess.fen(),
      difficulty: before.difficulty,
    };
    this.patchState({
      engineStatus: 'thinking',
      announcement: `${before.announcement} Stockfish is thinking.`.trim(),
    });

    try {
      const response = await this.engine.search(request);
      const current = this.mutableState();
      if (
        response.gameId !== current.gameId ||
        response.requestId !== this.requestId ||
        response.fen !== this.chess.fen() ||
        current.phase !== 'active'
      ) {
        return;
      }

      if (!response.move) {
        const result = this.evaluateAutomaticResult();
        if (result) {
          this.finishGame(result);
          return;
        }
        throw new Error('Stockfish did not return a move.');
      }

      const botMove = this.tryMove(response.move);
      if (!botMove) {
        throw new Error('Stockfish returned an illegal move.');
      }

      this.playMoveSound(botMove);
      this.publishPosition({
        engineStatus: 'ready',
        announcement: this.describeMove(botMove),
      });

      const result = this.evaluateAutomaticResult();
      if (result) {
        this.finishGame(result);
        return;
      }

      await this.executePendingPremove();
    } catch (error) {
      if (request.requestId === this.requestId && request.gameId === this.mutableState().gameId) {
        this.setEngineError(error);
      }
    }
  }

  async changeDifficulty(difficulty: DifficultyId): Promise<void> {
    if (difficulty === this.mutableState().difficulty) {
      return;
    }

    const wasThinking = this.mutableState().engineStatus === 'thinking';
    await this.invalidateSearch();
    const preferences = { ...this.mutableState().preferences, difficulty };
    this.patchState({
      difficulty,
      preferences,
      engineStatus: 'ready',
      announcement: `Difficulty changed to ${difficulty}.`,
    });
    await this.persistence.savePreferences(preferences);
    await this.persistGame();
    try {
      await this.engine.newGame(difficulty);
      if (
        wasThinking &&
        this.mutableState().phase === 'active' &&
        this.toColor(this.chess.turn()) !== this.mutableState().playerColor
      ) {
        await this.requestEngineMove();
      }
    } catch (error) {
      this.setEngineError(error);
    }
  }

  claimDraw(): boolean {
    const state = this.mutableState();
    if (!state.canClaimDraw || !state.isPlayerTurn || state.phase !== 'active') {
      return false;
    }

    const reason = this.chess.isThreefoldRepetition() ? 'threefold-repetition' : 'fifty-move';
    this.finishGame({
      winner: null,
      reason,
      label:
        reason === 'threefold-repetition'
          ? 'Draw by threefold repetition'
          : 'Draw by fifty-move rule',
    });
    return true;
  }

  async resignGame(): Promise<void> {
    const state = this.mutableState();
    if (state.phase !== 'active' || state.result) {
      return;
    }
    await this.invalidateSearch();
    this.finishGame({
      winner: this.opposite(state.playerColor),
      reason: 'resignation',
      label: 'You resigned',
    });
  }

  async restartGame(): Promise<void> {
    const state = this.mutableState();
    await this.startGame({
      colorSelection: state.playerColor,
      difficulty: state.difficulty,
    });
  }

  flipBoard(): void {
    const orientation = this.opposite(this.mutableState().orientation);
    const preferences = { ...this.mutableState().preferences, orientation };
    this.patchState({ orientation, preferences });
    void this.persistence.savePreferences(preferences);
    void this.persistGame();
  }

  updatePreferences(changes: Partial<GamePreferences>): void {
    const preferences = { ...this.mutableState().preferences, ...changes };
    this.sound.setEnabled(preferences.soundEnabled);
    this.patchState({
      preferences,
      orientation: preferences.orientation,
      difficulty: preferences.difficulty,
    });
    void this.persistence.savePreferences(preferences);
  }

  dismissRestored(): void {
    this.patchState({ restored: false });
  }

  unlockSound(): void {
    this.sound.unlock();
  }

  promotionRequired(input: Omit<MoveInput, 'promotion'>): boolean {
    const piece = this.chess.get(input.from);
    return (
      piece?.type === 'p' &&
      ((piece.color === 'w' && input.to.endsWith('8')) ||
        (piece.color === 'b' && input.to.endsWith('1')))
    );
  }

  async retryEngine(): Promise<void> {
    this.patchState({
      engineStatus: 'loading',
      engineError: null,
      announcement: 'Loading Stockfish.',
    });
    this.engine.destroy();
    try {
      await this.engine.initialize();
      await this.engine.newGame(this.mutableState().difficulty);
      this.patchState({ engineStatus: 'ready', announcement: 'Stockfish is ready.' });
      if (
        this.mutableState().phase === 'active' &&
        this.toColor(this.chess.turn()) !== this.mutableState().playerColor
      ) {
        await this.requestEngineMove();
      }
    } catch (error) {
      this.setEngineError(error);
    }
  }

  destroy(): void {
    this.engine.destroy();
  }

  private async initializeApplication(): Promise<void> {
    this.patchState({
      phase: 'restoring',
      engineStatus: 'loading',
      announcement: 'Loading Stockfish.',
    });
    const restored = await this.persistence.restore();
    this.sound.setEnabled(restored.preferences.soundEnabled);
    const restoredGame = this.restoreGame(restored.game);

    try {
      await this.engine.initialize();
      this.publishPosition({
        phase: restoredGame ? (restoredGame.result ? 'game-over' : 'active') : 'setup',
        engineStatus: 'ready',
        restored: restoredGame !== null,
        announcement: restoredGame ? 'Restored previous game.' : 'Stockfish is ready.',
        preferences: restored.preferences,
      });
      if (restoredGame && !restoredGame.result) {
        await this.engine.newGame(restoredGame.difficulty);
        if (this.toColor(this.chess.turn()) !== restoredGame.playerColor) {
          await this.requestEngineMove();
        }
      }
    } catch (error) {
      this.publishPosition({
        phase: restoredGame ? (restoredGame.result ? 'game-over' : 'active') : 'setup',
        restored: restoredGame !== null,
      });
      this.setEngineError(error);
    }
  }

  private restoreGame(game: PersistedGame | null): PersistedGame | null {
    if (!game) {
      this.chess = new Chess();
      this.mutableState.set(
        this.buildState({
          preferences: { ...this.mutableState().preferences },
          phase: 'restoring',
          engineStatus: 'loading',
        }),
      );
      return null;
    }

    try {
      const candidate = new Chess();
      candidate.loadPgn(game.pgn);
      const history = candidate.history({ verbose: true });
      if (
        candidate.fen() !== game.fen ||
        history.length !== game.moves.length ||
        history.some((move, index) => move.lan !== game.moves[index]?.lan)
      ) {
        throw new Error('Stored game is inconsistent.');
      }
      this.chess = candidate;
      this.mutableState.set(
        this.buildState({
          gameId: game.gameId,
          phase: game.result ? 'game-over' : 'restoring',
          engineStatus: 'loading',
          playerColor: game.playerColor,
          orientation: game.orientation,
          difficulty: game.difficulty,
          pendingPremove: game.pendingPremove,
          result: game.result,
          restored: true,
          preferences: {
            ...this.mutableState().preferences,
            orientation: game.orientation,
            difficulty: game.difficulty,
          },
        }),
      );
      return game;
    } catch {
      this.chess = new Chess();
      void this.persistence.clearGame();
      return null;
    }
  }

  private async afterCommittedMove(): Promise<void> {
    const result = this.evaluateAutomaticResult();
    if (result) {
      this.finishGame(result);
      return;
    }

    await this.persistGame();
    if (this.toColor(this.chess.turn()) !== this.mutableState().playerColor) {
      await this.requestEngineMove();
    }
  }

  private async executePendingPremove(): Promise<void> {
    const pending = this.mutableState().pendingPremove;
    if (!pending) {
      await this.persistGame();
      return;
    }

    this.patchState({ pendingPremove: null });
    const move = this.tryMove(pending);
    if (!move) {
      this.publishPosition({
        engineStatus: 'ready',
        announcement: 'The premove is no longer legal and was cancelled.',
      });
      await this.persistGame();
      return;
    }

    this.playMoveSound(move);
    this.publishPosition({
      engineStatus: 'ready',
      announcement: `${this.describeMove(move)} Premove played.`,
    });
    const result = this.evaluateAutomaticResult();
    if (result) {
      this.finishGame(result);
      return;
    }
    await this.persistGame();
    await this.requestEngineMove();
  }

  private tryMove(input: MoveInput): Move | null {
    try {
      return this.chess.move({
        from: input.from,
        to: input.to,
        ...(input.promotion ? { promotion: input.promotion } : {}),
      });
    } catch {
      return null;
    }
  }

  private evaluateAutomaticResult(): GameResult | null {
    if (this.chess.isCheckmate()) {
      const winner = this.opposite(this.toColor(this.chess.turn()));
      return { winner, reason: 'checkmate', label: `${this.capitalize(winner)} wins by checkmate` };
    }
    if (this.chess.isStalemate()) {
      return { winner: null, reason: 'stalemate', label: 'Draw by stalemate' };
    }
    if (this.chess.isInsufficientMaterial()) {
      return {
        winner: null,
        reason: 'insufficient-material',
        label: 'Draw by insufficient material',
      };
    }
    return null;
  }

  private finishGame(result: GameResult): void {
    this.requestId += 1;
    this.chess.setHeader('Result', this.resultTag(result));
    this.sound.play('game-end');
    this.publishPosition({
      phase: 'game-over',
      engineStatus: 'ready',
      pendingPremove: null,
      result,
      announcement: result.label,
    });
    void this.engine.stop();
    void this.persistGame();
  }

  private publishPosition(changes: Partial<GameViewState> = {}): void {
    const current = this.mutableState();
    this.mutableState.set(
      this.buildState({
        ...current,
        ...changes,
        preferences: changes.preferences ?? current.preferences,
      }),
    );
  }

  private patchState(changes: Partial<GameViewState>): void {
    this.mutableState.update((state) => ({ ...state, ...changes }));
  }

  private buildState(changes: Partial<GameViewState> = {}): GameViewState {
    const previous = this.mutableState?.();
    const playerColor = changes.playerColor ?? previous?.playerColor ?? 'white';
    const preferences = changes.preferences ?? previous?.preferences ?? { ...DEFAULT_PREFERENCES };
    const turn = this.toColor(this.chess.turn());
    const history = this.chess.history({ verbose: true });
    const last = history.at(-1);
    const result = changes.result === undefined ? (previous?.result ?? null) : changes.result;
    const phase = changes.phase ?? previous?.phase ?? 'setup';

    return {
      gameId: changes.gameId ?? previous?.gameId ?? EMPTY_GAME_ID,
      phase,
      engineStatus: changes.engineStatus ?? previous?.engineStatus ?? 'idle',
      engineError:
        changes.engineError === undefined ? (previous?.engineError ?? null) : changes.engineError,
      fen: this.chess.fen(),
      pgn: this.chess.pgn(),
      moves: this.toMoveRecords(history),
      playerColor,
      turn,
      orientation: changes.orientation ?? previous?.orientation ?? preferences.orientation,
      difficulty: changes.difficulty ?? previous?.difficulty ?? preferences.difficulty,
      pendingPremove:
        changes.pendingPremove === undefined
          ? (previous?.pendingPremove ?? null)
          : changes.pendingPremove,
      result,
      lastMove: last ? [last.from, last.to] : null,
      checkSquare: this.chess.inCheck()
        ? (this.chess.findPiece({ type: 'k', color: this.chess.turn() })[0] ?? null)
        : null,
      canClaimDraw:
        phase === 'active' &&
        !result &&
        (this.chess.isThreefoldRepetition() || this.chess.isDrawByFiftyMoves()),
      isPlayerTurn: phase === 'active' && !result && turn === playerColor,
      restored: changes.restored ?? previous?.restored ?? false,
      announcement: changes.announcement ?? previous?.announcement ?? '',
      preferences,
      legalDestinations: this.legalDestinations(
        turn === playerColor && phase === 'active' && !result,
      ),
    };
  }

  private legalDestinations(enabled: boolean): ReadonlyMap<Square, readonly Square[]> {
    const destinations = new Map<Square, Square[]>();
    if (!enabled) {
      return destinations;
    }
    for (const move of this.chess.moves({ verbose: true })) {
      const existing = destinations.get(move.from) ?? [];
      if (!existing.includes(move.to)) {
        existing.push(move.to);
      }
      destinations.set(move.from, existing);
    }
    return destinations;
  }

  private toMoveRecords(history: Move[]): MoveRecord[] {
    return history.map((move, index) => ({
      ply: index + 1,
      color: this.toColor(move.color),
      from: move.from,
      to: move.to,
      san: move.san,
      lan: move.lan,
      piece: move.piece,
      ...(move.captured ? { captured: move.captured } : {}),
      ...(move.promotion ? { promotion: move.promotion } : {}),
      before: move.before,
      after: move.after,
    }));
  }

  private async persistGame(): Promise<void> {
    const state = this.mutableState();
    if (state.gameId === EMPTY_GAME_ID || state.phase === 'setup' || state.phase === 'restoring') {
      return;
    }
    await this.persistence.saveGame({
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      gameId: state.gameId,
      pgn: this.chess.pgn(),
      fen: this.chess.fen(),
      moves: [...state.moves],
      playerColor: state.playerColor,
      orientation: state.orientation,
      difficulty: state.difficulty,
      pendingPremove: state.pendingPremove,
      result: state.result,
      updatedAt: new Date().toISOString(),
    });
  }

  private async invalidateSearch(): Promise<void> {
    this.requestId += 1;
    if (this.mutableState().engineStatus === 'thinking') {
      this.patchState({ engineStatus: 'stopping' });
    }
    await this.engine.stop().catch(() => undefined);
  }

  private playMoveSound(move: Move): void {
    let event: SoundEvent = 'move';
    if (move.isPromotion()) {
      event = 'promotion';
    } else if (move.isKingsideCastle() || move.isQueensideCastle()) {
      event = 'castle';
    } else if (move.isCapture() || move.isEnPassant()) {
      event = 'capture';
    }
    this.sound.play(event);
    if (this.chess.inCheck() && !this.chess.isCheckmate()) {
      this.sound.play('check');
    }
  }

  private describeMove(move: Move): string {
    const pieceNames: Record<PieceSymbol, string> = {
      p: 'pawn',
      n: 'knight',
      b: 'bishop',
      r: 'rook',
      q: 'queen',
      k: 'king',
    };
    return `${this.capitalize(this.toColor(move.color))} ${pieceNames[move.piece]} ${move.from} to ${move.to}${this.chess.inCheck() ? ', check' : ''}.`;
  }

  private setEngineError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Stockfish is unavailable.';
    this.patchState({ engineStatus: 'error', engineError: message, announcement: message });
  }

  private chooseColor(selection: StartGameOptions['colorSelection']): ChessColor {
    if (selection !== 'random') {
      return selection;
    }
    const value = new Uint8Array(1);
    crypto.getRandomValues(value);
    return (value[0] ?? 0) % 2 === 0 ? 'white' : 'black';
  }

  private toColor(color: Color): ChessColor {
    return color === 'w' ? 'white' : 'black';
  }

  private opposite(color: ChessColor): ChessColor {
    return color === 'white' ? 'black' : 'white';
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private resultTag(result: GameResult): string {
    if (!result.winner) {
      return '1/2-1/2';
    }
    return result.winner === 'white' ? '1-0' : '0-1';
  }
}

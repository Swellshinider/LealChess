import { TestBed } from '@angular/core/testing';
import { Chess } from 'chess.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENGINE_PORT,
  type EngineMove,
  type EnginePort,
  type EngineSearchRequest,
} from '../engine/engine.types';
import {
  PERSISTENCE_PORT,
  PERSISTENCE_SCHEMA_VERSION,
  type PersistedGame,
  type PersistencePort,
} from '../persistence/persistence.types';
import { SoundService } from '../sound/sound.service';
import { GameController } from './game-controller.service';
import { DEFAULT_PREFERENCES, type GamePreferences } from './game.types';

class FakeEngine implements EnginePort {
  readonly requests: EngineSearchRequest[] = [];
  moves: EngineMove['move'][] = [{ from: 'e7', to: 'e5' }];
  deferred:
    | {
        promise: Promise<EngineMove['move']>;
        resolve: (move: EngineMove['move']) => void;
      }
    | undefined;
  initialize = vi.fn(async () => undefined);
  newGame = vi.fn(async () => undefined);
  stop = vi.fn(async () => undefined);
  destroy = vi.fn();

  async search(request: EngineSearchRequest): Promise<EngineMove> {
    this.requests.push(request);
    const move = this.deferred ? await this.deferred.promise : (this.moves.shift() ?? null);
    this.deferred = undefined;
    return {
      ...request,
      move,
    };
  }

  deferNextSearch(): void {
    let resolve!: (move: EngineMove['move']) => void;
    const promise = new Promise<EngineMove['move']>((complete) => {
      resolve = complete;
    });
    this.deferred = { promise, resolve };
  }
}

class FakePersistence implements PersistencePort {
  restoredGame: PersistedGame | null = null;
  preferences: GamePreferences = { ...DEFAULT_PREFERENCES };
  savedGames: PersistedGame[] = [];

  async restore() {
    return { game: this.restoredGame, preferences: this.preferences };
  }
  async saveGame(game: PersistedGame) {
    this.savedGames.push(structuredClone(game));
  }
  async savePreferences(preferences: GamePreferences) {
    this.preferences = structuredClone(preferences);
  }
  async clearGame() {
    this.restoredGame = null;
  }
  async flush() {}
}

describe('GameController', () => {
  let engine: FakeEngine;
  let persistence: FakePersistence;
  let controller: GameController;
  const sound = {
    setEnabled: vi.fn(),
    setVolume: vi.fn(),
    unlock: vi.fn(),
    play: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new FakeEngine();
    persistence = new FakePersistence();
    TestBed.configureTestingModule({
      providers: [
        GameController,
        { provide: ENGINE_PORT, useValue: engine },
        { provide: PERSISTENCE_PORT, useValue: persistence },
        { provide: SoundService, useValue: sound },
      ],
    });
    controller = TestBed.inject(GameController);
  });

  it('applies restored and updated sound preferences', async () => {
    persistence.preferences = { ...DEFAULT_PREFERENCES, soundEnabled: false, soundVolume: 35 };

    await controller.initialize();
    expect(sound.setEnabled).toHaveBeenLastCalledWith(false);
    expect(sound.setVolume).toHaveBeenLastCalledWith(35);

    controller.updatePreferences({ soundEnabled: true, soundVolume: 70 });
    expect(sound.setEnabled).toHaveBeenLastCalledWith(true);
    expect(sound.setVolume).toHaveBeenLastCalledWith(70);
    expect(persistence.preferences.soundVolume).toBe(70);
  });

  it('commits legal player and engine moves while rejecting illegal input', async () => {
    await controller.initialize();
    await controller.startGame({ colorSelection: 'white', botRating: 1500 });

    const before = controller.state().fen;
    await expect(controller.makePlayerMove({ from: 'e2', to: 'e5' })).resolves.toBe(false);
    expect(controller.state().fen).toBe(before);

    await expect(controller.makePlayerMove({ from: 'e2', to: 'e4' })).resolves.toBe(true);
    expect(controller.state().moves.map((move) => move.lan)).toEqual(['e2e4', 'e7e5']);
    expect(engine.requests).toHaveLength(1);
  });

  it('restores a valid game and rejects an inconsistent snapshot', async () => {
    const chess = new Chess();
    chess.move('e4');
    persistence.restoredGame = snapshot(chess);

    await controller.initialize();
    expect(controller.state().restored).toBe(true);
    expect(controller.state().moves[0]?.san).toBe('e4');

    TestBed.resetTestingModule();
    const badPersistence = new FakePersistence();
    badPersistence.restoredGame = { ...snapshot(chess), fen: new Chess().fen() };
    TestBed.configureTestingModule({
      providers: [
        GameController,
        { provide: ENGINE_PORT, useValue: new FakeEngine() },
        { provide: PERSISTENCE_PORT, useValue: badPersistence },
      ],
    });
    const badController = TestBed.inject(GameController);
    await badController.initialize();
    expect(badController.state().restored).toBe(false);
    expect(badController.state().moves).toHaveLength(0);
  });

  it('executes a legal premove after the engine move', async () => {
    await controller.initialize();
    await controller.startGame({ colorSelection: 'white', botRating: 1500 });
    engine.deferNextSearch();
    engine.moves = [{ from: 'g8', to: 'f6' }];
    const movePromise = controller.makePlayerMove({ from: 'e2', to: 'e4' });
    await vi.waitFor(() => expect(engine.requests).toHaveLength(1));
    expect(controller.queuePremove({ from: 'g1', to: 'f3' })).toBe(true);
    engine.deferred?.resolve({ from: 'e7', to: 'e5' });
    await movePromise;

    expect(controller.state().moves.map((move) => move.lan)).toEqual([
      'e2e4',
      'e7e5',
      'g1f3',
      'g8f6',
    ]);
    expect(controller.state().pendingPremove).toBeNull();
  });

  it('cancels a premove that is illegal in the resulting position', async () => {
    await controller.initialize();
    await controller.startGame({ colorSelection: 'white', botRating: 1500 });
    engine.deferNextSearch();
    const movePromise = controller.makePlayerMove({ from: 'e2', to: 'e4' });
    await vi.waitFor(() => expect(engine.requests).toHaveLength(1));
    expect(controller.queuePremove({ from: 'e4', to: 'f5' })).toBe(true);
    engine.deferred?.resolve({ from: 'e7', to: 'e5' });
    await movePromise;

    expect(controller.state().moves.map((move) => move.lan)).toEqual(['e2e4', 'e7e5']);
    expect(controller.state().pendingPremove).toBeNull();
    expect(controller.state().announcement).toMatch(/no longer legal/);
  });

  it('rejects a stale engine response after restart', async () => {
    await controller.initialize();
    await controller.startGame({ colorSelection: 'white', botRating: 1500 });
    engine.deferNextSearch();
    const oldMove = controller.makePlayerMove({ from: 'e2', to: 'e4' });
    await vi.waitFor(() => expect(engine.requests).toHaveLength(1));

    const restart = controller.restartGame();
    engine.deferred?.resolve({ from: 'e7', to: 'e5' });
    await Promise.all([oldMove, restart]);

    expect(controller.state().moves).toHaveLength(0);
  });

  it('starts a playable game after the previous game has finished', async () => {
    await controller.initialize();
    await controller.startGame({ colorSelection: 'white', botRating: 1500 });
    await controller.resignGame();

    expect(controller.state().phase).toBe('game-over');
    expect(controller.state().result).not.toBeNull();

    await controller.startGame({ colorSelection: 'white', botRating: 1500 });

    expect(controller.state().phase).toBe('active');
    expect(controller.state().result).toBeNull();
    expect(controller.state().pendingPremove).toBeNull();
    expect(controller.state().restored).toBe(false);
    expect(controller.state().legalDestinations.get('e2')).toEqual(['e3', 'e4']);
    await expect(controller.makePlayerMove({ from: 'e2', to: 'e4' })).resolves.toBe(true);
  });
});

function snapshot(chess: Chess): PersistedGame {
  return {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    gameId: 'restored',
    pgn: chess.pgn(),
    fen: chess.fen(),
    moves: chess.history({ verbose: true }).map((move, index) => ({
      ply: index + 1,
      color: move.color === 'w' ? 'white' : 'black',
      from: move.from,
      to: move.to,
      san: move.san,
      lan: move.lan,
      piece: move.piece,
      before: move.before,
      after: move.after,
    })),
    playerColor: 'black',
    orientation: 'black',
    botRating: 1500,
    pendingPremove: null,
    result: null,
    updatedAt: new Date().toISOString(),
  };
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { BoardTheme, MoveInput } from '../../../core/game/game.types';
import type { PromotionPiece } from '../../../core/game/game.types';
import { PERSISTENCE_PORT } from '../../../core/persistence/persistence.types';
import { SoundService } from '../../../core/sound/sound.service';
import type { ChessColor } from '../../../shared/chess/chess.types';
import { learnerColorForGame, trainingPositions } from '../analysis/analysis-rules';
import { CoachAnalysisService } from '../analysis/coach-analysis.service';
import { detectOpening } from '../analysis/opening-index';
import { CoachRepositoryService } from '../data/coach-repository.service';
import type { GameSource, ImportedGame, TrainingPosition } from '../domain/coach.types';
import { PracticeAnalysisService } from './practice-analysis.service';
import { practiceSessionKey } from './practice-session';
import type { PracticeSession, PracticeVariationNode } from './practice.types';

export type ReviewMode = 'summary' | 'analysis' | 'practice';
export type PuzzleStatus = 'ready' | 'incorrect' | 'correct' | 'revealed';

@Injectable()
export class ReviewPageStore {
  private readonly route = inject(ActivatedRoute);
  private readonly repository = inject(CoachRepositoryService);
  private readonly persistence = inject(PERSISTENCE_PORT);
  private readonly sound = inject(SoundService);
  readonly practiceAnalysis = inject(PracticeAnalysisService);
  readonly coachAnalysis = inject(CoachAnalysisService);

  readonly game = signal<ImportedGame | null>(null);
  readonly loading = signal(true);
  readonly currentPly = signal(0);
  readonly orientation = signal<ChessColor>('white');
  readonly learnerColor = signal<ChessColor | null>(null);
  readonly boardTheme = signal<BoardTheme>('tournament');
  readonly mode = signal<ReviewMode>('summary');
  readonly trainingIndex = signal(0);
  readonly puzzleStatus = signal<PuzzleStatus>('ready');
  readonly pendingPromotion = signal<Omit<MoveInput, 'promotion'> | null>(null);
  readonly practiceSessions = signal<Record<string, PracticeSession>>({});
  readonly practiceReplayFen = signal<string | null>(null);
  readonly practiceReplaying = signal(false);
  readonly promotionPieces: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];

  readonly positions = computed(() => {
    const game = this.game();
    return game ? trainingPositions(game, this.coachAnalysis.analysis()) : [];
  });
  readonly activePosition = computed<TrainingPosition | null>(
    () => this.positions()[this.trainingIndex()] ?? null,
  );
  readonly activePracticeSession = computed<PracticeSession | null>(() => {
    const position = this.activePosition();
    return position ? (this.practiceSessions()[practiceSessionKey(position)] ?? null) : null;
  });
  readonly selectedPracticeNode = computed<PracticeVariationNode | null>(() => {
    const session = this.activePracticeSession();
    return session?.nodes[session.selectedNodeId] ?? null;
  });
  readonly practiceMoveCount = computed(() => {
    const session = this.activePracticeSession();
    return session ? Math.max(0, Object.keys(session.nodes).length - 1) : 0;
  });
  readonly practiceInputLocked = computed(
    () => this.practiceReplaying() || this.practiceAnalysis.state().phase === 'quick',
  );

  async initialize(): Promise<void> {
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
      if (game) {
        const reviewedGame = this.withDetectedOpening(game);
        this.game.set(reviewedGame);
        const color = learnerColorForGame(reviewedGame, profiles) ?? null;
        this.learnerColor.set(color);
        if (color) {
          this.orientation.set(color);
          await this.coachAnalysis.load(reviewedGame, color);
        }
      } else {
        this.game.set(null);
      }
    }
    this.loading.set(false);
  }

  destroy(): void {
    this.coachAnalysis.cancel();
    this.practiceAnalysis.destroy();
  }

  private withDetectedOpening(game: ImportedGame): ImportedGame {
    if (game.opening?.name.trim()) return game;
    const opening = detectOpening(
      game.moves[0]?.fenBefore,
      game.moves.map((move) => move.fenAfter),
    );
    if (!opening) return game;
    void this.repository.saveOpeningIfMissing(game.key, opening).catch(() => undefined);
    return { ...game, opening };
  }
}

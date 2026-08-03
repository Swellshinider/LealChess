import type { AnalysisEnginePort } from '../../../core/engine/analysis-engine.types';
import type { AnalysisProfile } from '../../../core/engine/analysis-profiles';
import { analysisProfileFingerprint } from '../../../core/engine/analysis-profiles';
import type { ChessColor } from '../../../shared/chess/chess.types';
import type { GameAnalysis, ImportedGame, MoveAnalysis } from '../domain/coach.types';
import { ANALYSIS_ENGINE_VERSION, ANALYSIS_SCHEMA_VERSION } from './analysis.constants';
import { analysisFingerprint, categorizeMistake, moveToSan, moveToUci } from './analysis-rules';
import { openingBookPlyCount } from './opening-index';
import { assessMove, legacyClassification } from './review-classification';

export interface PrepareGameAnalysisOptions {
  game: ImportedGame;
  learnerColor: ChessColor;
  cached: GameAnalysis | null;
  profile: AnalysisProfile;
  restart: boolean;
}

export interface PreparedGameAnalysis {
  analysis: GameAnalysis;
  fingerprint: string;
  profileFingerprint: string;
}

/** Resolves the analysis to resume (or start fresh), applying the same cache-reuse rules
 * regardless of whether a single game or a batch queues the work. */
export async function prepareGameAnalysis(
  options: PrepareGameAnalysisOptions,
): Promise<PreparedGameAnalysis> {
  const { game, learnerColor, cached, profile, restart } = options;
  const fingerprint = await analysisFingerprint(game, learnerColor);
  const profileFingerprint = analysisProfileFingerprint(profile);
  const userMoves = game.moves.filter((move) => move.color === learnerColor);
  const analysis =
    !restart &&
    cached?.sourceFingerprint === fingerprint &&
    (cached.profileFingerprint === profileFingerprint ||
      (cached.profileFingerprint === undefined && profile.depth === 16 && profile.lines === 2))
      ? cached
      : newAnalysis(
          game,
          learnerColor,
          fingerprint,
          userMoves.length,
          profile.depth,
          profileFingerprint,
        );
  return { analysis, fingerprint, profileFingerprint };
}

export interface RunGameAnalysisOptions {
  game: ImportedGame;
  learnerColor: ChessColor;
  profile: AnalysisProfile;
  base: GameAnalysis;
  engine: AnalysisEnginePort;
  signal: AbortSignal;
  save: (analysis: GameAnalysis) => Promise<void>;
  onMove?: (analysis: GameAnalysis) => void;
}

/** Runs the ply-by-ply engine review for one game, persisting after every move so a cancelled
 * or interrupted run can resume from the next unanalyzed ply. Throws on abort or engine failure;
 * the caller decides how to react (stop, skip, retry). */
export async function runGameAnalysis(run: RunGameAnalysisOptions): Promise<GameAnalysis> {
  const { game, learnerColor, profile, engine, signal, save, onMove } = run;
  let analysis = run.base;
  const reviewMoves = game.moves;
  const completedPlies = new Set((analysis.reviewMoves ?? []).map((move) => move.ply));
  const bookPlyLimit = openingBookPlyCount(reviewMoves.map((move) => move.fenAfter));

  for (const move of reviewMoves) {
    if (completedPlies.has(move.ply)) continue;
    const best = await engine.analyze({
      fen: move.fenBefore,
      engineId: profile.engineId,
      depth: profile.depth,
      multiPv: profile.lines,
      signal,
    });
    if (!best.bestMove) throw new Error(`No best move was returned for ply ${move.ply}.`);
    const bestMove = moveToUci(best.bestMove);
    const played =
      bestMove === move.uci
        ? best
        : await engine.analyze({
            fen: move.fenBefore,
            engineId: profile.engineId,
            depth: profile.depth,
            searchMove: move.uci,
            signal,
          });
    const result = assessMove(move, best, played, move.ply <= bookPlyLimit);
    const bestMoveSan = moveToSan(move.fenBefore, best.bestMove);
    const moveAnalysis: MoveAnalysis = {
      importedGameKey: game.key,
      ply: move.ply,
      playedMove: move.uci,
      bestMove,
      bestMoveSan,
      principalVariation: best.principalVariation,
      playedPrincipalVariation: played.principalVariation,
      bestEvaluation: best.evaluation,
      playedEvaluation: played.evaluation,
      ...(result.centipawnLoss === undefined ? {} : { centipawnLoss: result.centipawnLoss }),
      classification: legacyClassification(result.classification),
      reviewClassification: result.classification,
      ...(move.color !== learnerColor || !result.concern
        ? {}
        : { category: categorizeMistake(move.fenBefore, move.ply, bestMoveSan) }),
    };
    const nextReviewMoves = [...(analysis.reviewMoves ?? []), moveAnalysis].sort(
      (left, right) => left.ply - right.ply,
    );
    analysis = {
      ...analysis,
      moves:
        move.color === learnerColor
          ? [...analysis.moves, moveAnalysis].sort((left, right) => left.ply - right.ply)
          : analysis.moves,
      reviewMoves: nextReviewMoves,
      status: 'partial',
      updatedAt: new Date().toISOString(),
    };
    onMove?.(analysis);
    await save(analysis);
  }

  const completedAt = new Date().toISOString();
  analysis = { ...analysis, status: 'complete', updatedAt: completedAt, completedAt };
  await save(analysis);
  return analysis;
}

function newAnalysis(
  game: ImportedGame,
  learnerColor: ChessColor,
  sourceFingerprint: string,
  totalUserMoves: number,
  depth: number,
  profileFingerprint: string,
): GameAnalysis {
  return {
    importedGameKey: game.key,
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    sourceFingerprint,
    engineVersion: ANALYSIS_ENGINE_VERSION,
    depth,
    profileFingerprint,
    learnerColor,
    status: 'partial',
    totalUserMoves,
    moves: [],
    reviewMoves: [],
    updatedAt: new Date().toISOString(),
  };
}

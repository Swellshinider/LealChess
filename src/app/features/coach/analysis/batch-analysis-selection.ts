import { learnerColorForGame } from './analysis-rules';
import type { GameAnalysis, ImportedGame, ImportedProfile } from '../domain/coach.types';

/** Picks up to `count` games for a background analysis run, newest to oldest, skipping games
 * that cannot be replayed or reviewed and games already fully analyzed. Callers are expected to
 * pass games in their existing archive order (newest first). */
export function selectGamesForBatchAnalysis(
  games: readonly ImportedGame[],
  profiles: readonly ImportedProfile[],
  analyses: readonly GameAnalysis[],
  count: number,
): ImportedGame[] {
  const completedKeys = new Set(
    analyses
      .filter((analysis) => analysis.status === 'complete')
      .map((analysis) => analysis.importedGameKey),
  );
  const selected: ImportedGame[] = [];
  for (const game of games) {
    if (selected.length >= count) break;
    if (game.parseStatus !== 'ready' || !game.moves.length) continue;
    if (completedKeys.has(game.key)) continue;
    if (!learnerColorForGame(game, [...profiles])) continue;
    selected.push(game);
  }
  return selected;
}

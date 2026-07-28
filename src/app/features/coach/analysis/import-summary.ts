import type { ChessColor } from '../../../shared/chess/chess.types';
import type { ImportedGame, ImportSummary } from '../domain/coach.types';

export function calculateImportSummary(
  games: readonly ImportedGame[],
  usernames: Partial<Record<ImportedGame['platform'], string>>,
): ImportSummary {
  const summary: ImportSummary = {
    total: games.length,
    wins: 0,
    draws: 0,
    losses: 0,
    asWhite: { wins: 0, draws: 0, losses: 0 },
    asBlack: { wins: 0, draws: 0, losses: 0 },
    topOpenings: [],
  };
  const openings = new Map<string, { name: string; eco?: string; count: number }>();

  for (const game of games) {
    const username = usernames[game.platform]?.toLowerCase();
    const color: ChessColor | undefined =
      game.learnerColor ??
      (game.white.username.toLowerCase() === username
        ? 'white'
        : game.black.username.toLowerCase() === username
          ? 'black'
          : undefined);
    if (!color) continue;
    const result = learnerResult(game.result, color);
    summary[result] += 1;
    summary[color === 'white' ? 'asWhite' : 'asBlack'][result] += 1;
    if (game.opening?.name) {
      const key = `${game.opening.eco ?? ''}:${game.opening.name}`;
      const current = openings.get(key);
      openings.set(key, {
        name: game.opening.name,
        ...(game.opening.eco ? { eco: game.opening.eco } : {}),
        count: (current?.count ?? 0) + 1,
      });
    }
  }
  summary.topOpenings = [...openings.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 3);
  return summary;
}

function learnerResult(result: string, color: ChessColor): 'wins' | 'draws' | 'losses' {
  if (result === '1/2-1/2' || result === '½-½' || result === '*') return 'draws';
  return (result === '1-0') === (color === 'white') ? 'wins' : 'losses';
}

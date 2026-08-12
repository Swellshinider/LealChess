import type { CompactPuzzleCatalog, Puzzle } from './puzzle.types';

export function expandCatalog(catalog: CompactPuzzleCatalog): Puzzle[] {
  return catalog.puzzles.map(([id, fen, solution, rating, themes, openings]) => ({
    source: 'lichess-catalog',
    key: catalog.strings[id]!,
    fen: catalog.strings[fen]!,
    solution: catalog.strings[solution]!.split(' '),
    externalUrl: `https://lichess.org/training/${catalog.strings[id]!}`,
    rating,
    themes: themes.map((index) => catalog.strings[index]!),
    openings: openings.map((index) => catalog.strings[index]!),
  }));
}

export function matchingPuzzles(
  puzzles: readonly Puzzle[],
  tags: readonly string[],
  minimum: number,
  maximum: number,
): Puzzle[] {
  return puzzles.filter((puzzle) => {
    const rating = puzzle.rating ?? 0;
    const available = new Set([...puzzle.themes, ...puzzle.openings]);
    return rating >= minimum && rating <= maximum && tags.every((tag) => available.has(tag));
  });
}

export function choosePracticePuzzle(
  candidates: readonly Puzzle[],
  attempts: readonly { puzzleKey: string; completedAt: string }[],
  random = Math.random,
): Puzzle | null {
  if (candidates.length === 0) return null;
  const seen = new Set(attempts.map((attempt) => attempt.puzzleKey));
  const unseen = candidates.filter((puzzle) => !seen.has(puzzle.key));
  if (unseen.length > 0) return unseen[Math.floor(random() * unseen.length)]!;
  const lastAttempt = new Map<string, string>();
  for (const attempt of attempts) {
    if ((lastAttempt.get(attempt.puzzleKey) ?? '') < attempt.completedAt) {
      lastAttempt.set(attempt.puzzleKey, attempt.completedAt);
    }
  }
  return [...candidates].sort((a, b) =>
    (lastAttempt.get(a.key) ?? '').localeCompare(lastAttempt.get(b.key) ?? ''),
  )[0]!;
}

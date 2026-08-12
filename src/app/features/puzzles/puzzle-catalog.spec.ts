import { describe, expect, it } from 'vitest';
import { choosePracticePuzzle, matchingPuzzles } from './puzzle-catalog';
import type { Puzzle } from './puzzle.types';

const puzzles: Puzzle[] = [
  {
    source: 'lichess-catalog',
    key: 'a',
    fen: '',
    solution: [],
    externalUrl: '',
    rating: 1000,
    themes: ['fork', 'short'],
    openings: ['Sicilian'],
  },
  {
    source: 'lichess-catalog',
    key: 'b',
    fen: '',
    solution: [],
    externalUrl: '',
    rating: 1200,
    themes: ['fork'],
    openings: ['French'],
  },
];

describe('practice selection', () => {
  it('matches every selected tag with inclusive ratings', () => {
    expect(
      matchingPuzzles(puzzles, ['fork', 'Sicilian'], 1000, 1000).map((item) => item.key),
    ).toEqual(['a']);
    expect(matchingPuzzles(puzzles, ['fork', 'French'], 1000, 1100)).toEqual([]);
  });

  it('chooses unseen puzzles then recycles the least recent', () => {
    expect(
      choosePracticePuzzle(puzzles, [{ puzzleKey: 'a', completedAt: '2026-01-01' }], () => 0)?.key,
    ).toBe('b');
    expect(
      choosePracticePuzzle(puzzles, [
        { puzzleKey: 'a', completedAt: '2026-01-01' },
        { puzzleKey: 'b', completedAt: '2026-02-01' },
      ])?.key,
    ).toBe('a');
  });
});

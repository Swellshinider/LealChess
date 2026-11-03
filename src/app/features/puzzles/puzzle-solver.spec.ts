import { describe, expect, it } from 'vitest';
import type { Puzzle } from './puzzle.types';
import { createSolver, playPuzzleMove, revealPuzzle, useHint } from './puzzle-solver';

const puzzle: Puzzle = {
  source: 'lichess-catalog',
  key: 'line',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  solution: ['e2e4', 'e7e5', 'g1f3'],
  externalUrl: 'https://lichess.org/training/line',
  themes: ['opening'],
  openings: [],
};

describe('puzzle solver', () => {
  it('keeps an incorrect move at the same position and completes a multi-ply line', () => {
    const initial = createSolver(puzzle);
    const wrong = playPuzzleMove(puzzle, initial, { from: 'd2', to: 'd4' });
    expect(wrong.fen).toBe(initial.fen);
    expect(wrong.mistakes).toBe(1);
    const afterReply = playPuzzleMove(puzzle, wrong, { from: 'e2', to: 'e4' });
    expect(afterReply.played).toEqual(['e2e4', 'e7e5']);
    const complete = playPuzzleMove(puzzle, afterReply, { from: 'g1', to: 'f3' });
    expect(complete.outcome).toBe('completed-with-errors');
  });

  it('uses two hint stages and classifies an assisted solve', () => {
    const first = useHint(createSolver(puzzle));
    expect(first.hintLevel).toBe(1);
    expect(useHint(first).hintLevel).toBe(2);
    const complete = playPuzzleMove(puzzle, first, { from: 'e2', to: 'e4' });
    expect(playPuzzleMove(puzzle, complete, { from: 'g1', to: 'f3' }).outcome).toBe('assisted');
  });

  it('reveals the complete remaining line', () => {
    const revealed = revealPuzzle(puzzle, createSolver(puzzle));
    expect(revealed.outcome).toBe('revealed');
    expect(revealed.played).toEqual(puzzle.solution);
  });

  it('accepts an alternate legal mate in a mate-in-one puzzle', () => {
    const mate: Puzzle = {
      ...puzzle,
      key: 'mate',
      fen: '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1',
      solution: ['g6g7'],
    };
    const result = playPuzzleMove(mate, createSolver(mate), { from: 'g6', to: 'g8' });
    expect(result.outcome).toBe('clean-solved');
  });
});

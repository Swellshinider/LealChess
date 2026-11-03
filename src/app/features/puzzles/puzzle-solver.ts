import { Chess } from 'chess.js';
import type { MoveInput } from '../../core/game/game.types';
import { moveToUci } from '../../core/game/chess-move';
import type { Puzzle, PuzzleOutcome } from './puzzle.types';

export interface SolverState {
  readonly startedAt: string;
  readonly fen: string;
  readonly index: number;
  readonly mistakes: number;
  readonly hintLevel: 0 | 1 | 2;
  readonly revealed: boolean;
  readonly complete: boolean;
  readonly outcome?: PuzzleOutcome;
  readonly played: readonly string[];
}

export function createSolver(puzzle: Puzzle): SolverState {
  return {
    startedAt: new Date().toISOString(),
    fen: puzzle.fen,
    index: 0,
    mistakes: 0,
    hintLevel: 0,
    revealed: false,
    complete: false,
    played: [],
  };
}

export function playPuzzleMove(puzzle: Puzzle, state: SolverState, input: MoveInput): SolverState {
  if (state.complete) return state;
  const uci = moveToUci(input);
  const position = new Chess(state.fen);
  let legalMate = false;
  try {
    position.move(input);
    legalMate = position.isCheckmate();
  } catch {
    return state;
  }
  const expected = puzzle.solution[state.index];
  const alternateMate = puzzle.solution.length === 1 && state.index === 0 && legalMate;
  if (uci !== expected && !alternateMate) return { ...state, mistakes: state.mistakes + 1 };

  const played = [...state.played, uci];
  let index = state.index + 1;
  let fen = position.fen();
  if (index < puzzle.solution.length) {
    const reply = puzzle.solution[index]!;
    const replyPosition = new Chess(fen);
    replyPosition.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    played.push(reply);
    fen = replyPosition.fen();
    index += 1;
  }
  const complete = index >= puzzle.solution.length;
  return {
    ...state,
    fen,
    index,
    played,
    complete,
    outcome: complete ? classify(state.mistakes, state.hintLevel, false) : undefined,
  };
}

export function useHint(state: SolverState): SolverState {
  if (state.complete) return state;
  return { ...state, hintLevel: state.hintLevel === 0 ? 1 : 2 };
}

export function revealPuzzle(puzzle: Puzzle, state: SolverState): SolverState {
  const chess = new Chess(state.fen);
  const played = [...state.played];
  for (const uci of puzzle.solution.slice(state.index)) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    played.push(uci);
  }
  return {
    ...state,
    fen: chess.fen(),
    index: puzzle.solution.length,
    hintLevel: Math.max(1, state.hintLevel) as 1 | 2,
    revealed: true,
    complete: true,
    outcome: 'revealed',
    played,
  };
}

export function classify(mistakes: number, hintLevel: number, revealed: boolean): PuzzleOutcome {
  if (revealed) return 'revealed';
  if (hintLevel > 0) return 'assisted';
  return mistakes > 0 ? 'completed-with-errors' : 'clean-solved';
}

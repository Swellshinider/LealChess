import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { chooseChessColor, resultTag } from './game-presentation';
import { evaluateAutomaticResult } from './game-result';
import { buildGameViewState } from './game-state';

describe('pure game controller modules', () => {
  it('constructs legal player state from a chess position', () => {
    const state = buildGameViewState(new Chess(), undefined, { phase: 'active' });
    expect(state.turn).toBe('white');
    expect(state.legalDestinations.get('e2')).toEqual(['e3', 'e4']);
  });

  it('evaluates checkmate and presents result tags', () => {
    const chess = new Chess();
    chess.move('f3');
    chess.move('e5');
    chess.move('g4');
    chess.move('Qh4#');
    const result = evaluateAutomaticResult(chess);
    expect(result).toMatchObject({ winner: 'black', reason: 'checkmate' });
    expect(resultTag(result!)).toBe('0-1');
  });

  it('makes random color selection deterministic at the pure boundary', () => {
    expect(chooseChessColor('random', 2)).toBe('white');
    expect(chooseChessColor('random', 3)).toBe('black');
  });
});

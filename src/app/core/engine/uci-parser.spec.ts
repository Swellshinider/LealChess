import { describe, expect, it } from 'vitest';
import { parseBestMove } from './uci-parser';

describe('parseBestMove', () => {
  it('parses a normal move', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ from: 'e2', to: 'e4' });
  });

  it('parses promotion', () => {
    expect(parseBestMove('bestmove a7a8q')).toEqual({
      from: 'a7',
      to: 'a8',
      promotion: 'q',
    });
  });

  it('reports an empty move and ignores info lines', () => {
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('info depth 12 score cp 24')).toBeUndefined();
  });

  it('does not allow malformed coordinates through', () => {
    expect(parseBestMove('bestmove e9e4')).toBeNull();
  });
});

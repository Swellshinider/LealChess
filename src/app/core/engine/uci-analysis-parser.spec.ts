import { describe, expect, it } from 'vitest';
import { parseAnalysisInfo } from './uci-analysis-parser';

describe('parseAnalysisInfo', () => {
  it('parses a centipawn score and principal variation', () => {
    expect(
      parseAnalysisInfo('info depth 14 seldepth 18 score cp 37 nodes 1200 pv e2e4 e7e5'),
    ).toEqual({
      evaluation: { score: { kind: 'centipawn', value: 37 }, depth: 14 },
      principalVariation: ['e2e4', 'e7e5'],
      bounded: false,
    });
  });

  it('parses mate scores and marks bounded evaluations', () => {
    expect(parseAnalysisInfo('info depth 12 score mate -3 upperbound nodes 42 pv g7g8q')).toEqual({
      evaluation: { score: { kind: 'mate', moves: -3 }, depth: 12 },
      principalVariation: ['g7g8q'],
      bounded: true,
    });
  });

  it('ignores malformed and unrelated lines', () => {
    expect(parseAnalysisInfo('bestmove e2e4')).toBeUndefined();
    expect(parseAnalysisInfo('info depth twelve score cp 20')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { EngineEvaluation, GameAnalysis } from '../domain/coach.types';
import { categorizeMistake, classifyMove, learningPriorities } from './analysis-rules';

describe('analysis rules', () => {
  it.each([
    [49, 'good'],
    [50, 'inaccuracy'],
    [100, 'mistake'],
    [200, 'blunder'],
  ] as const)('classifies a %i centipawn loss as %s', (loss, classification) => {
    expect(classifyMove(cp(100), cp(100 - loss))).toEqual({
      classification,
      centipawnLoss: loss,
    });
  });

  it('treats a changed mate outcome as a blunder without fake centipawn loss', () => {
    expect(classifyMove(mate(3), cp(400))).toEqual({ classification: 'blunder' });
    expect(classifyMove(mate(3), mate(8))).toEqual({ classification: 'good' });
  });

  it('categorizes opening, endgame, tactical, and positional moments', () => {
    const middlegame = 'r3k2r/ppp2ppp/2npbn2/8/3P4/2N1PN2/PPP2PPP/R2QKB1R w KQkq - 0 12';
    expect(categorizeMistake(middlegame, 14, 'Nxd5')).toBe('opening');
    expect(categorizeMistake('8/8/4k3/8/8/4K3/4P3/8 w - - 0 40', 79, 'e4')).toBe('endgame');
    expect(categorizeMistake(middlegame, 25, 'Nxd5')).toBe('tactical');
    expect(categorizeMistake(middlegame, 25, 'Rc1')).toBe('positional');
  });

  it('only reports categories recurring across completed games', () => {
    const priorities = learningPriorities([
      analysis('one', 'tactical'),
      analysis('two', 'tactical'),
      analysis('three', 'opening', 'partial'),
    ]);
    expect(priorities).toMatchObject([{ category: 'tactical', moments: 2, games: 2 }]);
  });
});

function cp(value: number): EngineEvaluation {
  return { score: { kind: 'centipawn', value }, depth: 14 };
}

function mate(moves: number): EngineEvaluation {
  return { score: { kind: 'mate', moves }, depth: 14 };
}

function analysis(
  importedGameKey: string,
  category: 'opening' | 'tactical',
  status: GameAnalysis['status'] = 'complete',
): GameAnalysis {
  return {
    importedGameKey,
    schemaVersion: 1,
    sourceFingerprint: importedGameKey,
    engineVersion: 'test',
    depth: 14,
    learnerColor: 'white',
    status,
    totalUserMoves: 1,
    updatedAt: '',
    moves: [
      {
        importedGameKey,
        ply: 1,
        playedMove: 'e2e3',
        bestMove: 'e2e4',
        bestMoveSan: 'e4',
        principalVariation: [],
        bestEvaluation: cp(30),
        playedEvaluation: cp(-100),
        centipawnLoss: 130,
        classification: 'mistake',
        reviewClassification: 'mistake',
        category,
      },
    ],
  };
}

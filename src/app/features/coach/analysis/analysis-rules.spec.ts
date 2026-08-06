import { describe, expect, it } from 'vitest';
import type { GameAnalysis, ImportedGame } from '../domain/coach.types';
import type { EngineEvaluation } from '../../../core/engine/analysis-engine.types';
import { categorizeMistake, learningPriorities, trainingPositions } from './analysis-rules';

describe('analysis rules', () => {
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

  it('uses the canonical concern label for training positions', () => {
    const item = analysis('one', 'tactical');
    item.moves[0] = {
      ...item.moves[0]!,
      classification: 'mistake',
      reviewClassification: 'miss',
    };
    const game = {
      key: 'one',
      moves: [{ ply: 1, fenBefore: 'fen' }],
    } as ImportedGame;

    expect(trainingPositions(game, item)).toMatchObject([{ classification: 'miss' }]);
  });
});

function cp(value: number): EngineEvaluation {
  return { score: { kind: 'centipawn', value }, depth: 14 };
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

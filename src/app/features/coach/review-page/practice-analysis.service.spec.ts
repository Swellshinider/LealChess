import { TestBed } from '@angular/core/testing';
import { Chess } from 'chess.js';
import type {
  AnalysisEnginePort,
  PositionAnalysisRequest,
  PositionAnalysisResult,
} from '../../../core/engine/analysis-engine.types';
import { STARTING_FEN } from '../../../core/game/game.types';
import {
  PRACTICE_ANALYSIS_ENGINE_PORT,
  PracticeAnalysisService,
} from './practice-analysis.service';
import type { PracticeAnalysisRequest } from './practice.types';

class FakeAnalysisEngine implements AnalysisEnginePort {
  readonly requests: PositionAnalysisRequest[] = [];
  failDepth14 = false;

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  analyze(request: PositionAnalysisRequest): Promise<PositionAnalysisResult> {
    this.requests.push(request);
    if (this.failDepth14 && request.depth === 14) {
      return Promise.reject(new Error('Refinement failed.'));
    }
    const afterPlayerMove = request.fen !== STARTING_FEN;
    return Promise.resolve(
      result(request.depth, afterPlayerMove ? ['e7e5', 'c7c5', 'e7e6'] : ['e2e4', 'd2d4', 'g1f3']),
    );
  }

  destroy(): void {}
}

describe('PracticeAnalysisService', () => {
  let engine: FakeAnalysisEngine;
  let service: PracticeAnalysisService;

  beforeEach(() => {
    engine = new FakeAnalysisEngine();
    TestBed.configureTestingModule({
      providers: [
        PracticeAnalysisService,
        { provide: PRACTICE_ANALYSIS_ENGINE_PORT, useValue: engine },
      ],
    });
    service = TestBed.inject(PracticeAnalysisService);
  });

  afterEach(() => service.destroy());

  it('publishes three quick candidates and replaces them at depth 14', async () => {
    service.analyze(request());
    await vi.waitFor(() => expect(service.state().phase).toBe('complete'));

    expect(engine.requests.map(({ depth, multiPv }) => [depth, multiPv])).toEqual([
      [10, 3],
      [10, 3],
      [14, 3],
      [14, 3],
    ]);
    expect(service.state().result).toMatchObject({
      assessment: { classification: 'book', depth: 14, provisional: false },
    });
    expect(service.state().result?.candidates.map((line) => line.san[0])).toEqual([
      'e5',
      'c5',
      'e6',
    ]);
  });

  it('retains the quick result when refinement fails', async () => {
    engine.failDepth14 = true;
    service.analyze(request());
    await vi.waitFor(() => expect(service.state().phase).toBe('error'));

    expect(service.state()).toMatchObject({
      phase: 'error',
      error: 'Refinement failed.',
      result: {
        assessment: { depth: 10, provisional: true },
      },
    });
    expect(service.state().result?.candidates).toHaveLength(3);
  });
});

function request(): PracticeAnalysisRequest {
  const chess = new Chess(STARTING_FEN);
  const played = chess.move({ from: 'e2', to: 'e4' });
  return {
    nodeId: 'root/e2e4',
    fenBefore: STARTING_FEN,
    fenAfter: chess.fen(),
    move: { from: 'e2', to: 'e4' },
    san: played.san,
    color: 'white',
  };
}

function result(depth: number, moves: string[]): PositionAnalysisResult {
  const variations = moves.map((move, index) => ({
    rank: index + 1,
    evaluation: {
      score: { kind: 'centipawn' as const, value: 30 - index * 10 },
      depth,
    },
    principalVariation: [move],
    expectedPoints: 0.6 - index * 0.05,
  }));
  const first = variations[0]!;
  return {
    bestMove: {
      from: first.principalVariation[0]!.slice(0, 2) as 'e2',
      to: first.principalVariation[0]!.slice(2, 4) as 'e4',
    },
    evaluation: first.evaluation,
    principalVariation: first.principalVariation,
    expectedPoints: first.expectedPoints,
    variations,
  };
}

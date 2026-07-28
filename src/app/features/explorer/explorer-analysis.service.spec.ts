import { TestBed } from '@angular/core/testing';
import type {
  AnalysisEnginePort,
  PositionAnalysisRequest,
  PositionAnalysisResult,
} from '../../core/engine/analysis-engine.types';
import { STARTING_FEN } from '../../core/game/game.types';
import {
  EXPLORER_ANALYSIS_ENGINE_PORT,
  ExplorerAnalysisService,
} from './explorer-analysis.service';

class FakeExplorerEngine implements AnalysisEnginePort {
  readonly requests: PositionAnalysisRequest[] = [];

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  analyze(request: PositionAnalysisRequest): Promise<PositionAnalysisResult> {
    this.requests.push(request);
    const move = request.searchMove ?? 'e2e4';
    const expectedPoints = request.searchMove ? 0.38 : 0.62;
    return Promise.resolve({
      bestMove: { from: 'e2', to: 'e4' },
      evaluation: {
        score: { kind: 'centipawn', value: request.searchMove ? -80 : 30 },
        depth: request.depth,
      },
      expectedPoints,
      principalVariation: [move, 'e7e5'],
      variations: [
        {
          rank: 1,
          evaluation: { score: { kind: 'centipawn', value: 30 }, depth: request.depth },
          expectedPoints: 0.62,
          principalVariation: ['e2e4', 'e7e5'],
        },
        {
          rank: 2,
          evaluation: { score: { kind: 'centipawn', value: 20 }, depth: request.depth },
          expectedPoints: 0.6,
          principalVariation: ['d2d4', 'd7d5'],
        },
      ],
    });
  }

  destroy(): void {}
}

describe('ExplorerAnalysisService', () => {
  let engine: FakeExplorerEngine;
  let service: ExplorerAnalysisService;

  beforeEach(() => {
    engine = new FakeExplorerEngine();
    TestBed.configureTestingModule({
      providers: [
        ExplorerAnalysisService,
        { provide: EXPLORER_ANALYSIS_ENGINE_PORT, useValue: engine },
      ],
    });
    service = TestBed.inject(ExplorerAnalysisService);
  });

  afterEach(() => service.destroy());

  it('returns ranked SAN candidates and caches repeated position searches', async () => {
    const controller = new AbortController();
    const first = await service.candidates(STARTING_FEN, 14, controller.signal);
    const second = await service.candidates(STARTING_FEN, 14, controller.signal);

    expect(first.map((line) => line.san[0])).toEqual(['e4', 'd4']);
    expect(second).toEqual(first);
    expect(engine.requests).toHaveLength(1);
    expect(engine.requests[0]?.multiPv).toBe(3);
  });

  it('grades a non-best manual move with a forced search', async () => {
    const assessment = await service.assessMove(
      {
        nodeId: 'root/d2d3',
        fenBefore: STARTING_FEN,
        fenAfter: 'rnbqkbnr/pppppppp/8/8/8/3P4/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        move: { from: 'd2', to: 'd3' },
        san: 'd3',
        color: 'white',
      },
      14,
      new AbortController().signal,
    );

    expect(assessment).toMatchObject({
      classification: 'book',
      depth: 14,
      provisional: false,
      bestMove: 'e2e4',
    });
    expect(engine.requests.some((request) => request.searchMove === 'd2d3')).toBe(true);
  });
});

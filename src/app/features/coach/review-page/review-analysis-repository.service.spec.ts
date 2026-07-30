import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { Chess } from 'chess.js';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ImportedGame } from '../domain/coach.types';
import { commitReviewMove, createReviewAnalysisSession } from './review-analysis-session';
import { ReviewAnalysisRepositoryService } from './review-analysis-repository.service';

describe('ReviewAnalysisRepositoryService', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    });
    TestBed.configureTestingModule({ providers: [ReviewAnalysisRepositoryService] });
  });

  it('round-trips legal user branches and the selected node', async () => {
    const repository = TestBed.inject(ReviewAnalysisRepositoryService);
    const imported = game();
    const session = commitReviewMove(createReviewAnalysisSession(imported), {
      from: 'd2',
      to: 'd4',
    }).session;

    await repository.save(session);
    await repository.flush();
    const restored = await repository.restore(imported);

    expect(restored.selectedNodeId).toBe(session.selectedNodeId);
    expect(restored.nodes[session.selectedNodeId]).toMatchObject({
      san: 'd4',
      source: 'manual',
    });
  });
});

function game(): ImportedGame {
  const chess = new Chess();
  const move = chess.move('e4');
  return {
    key: 'local:round-trip',
    platform: 'local',
    platformGameId: 'round-trip',
    platformUrl: '',
    pgn: '',
    variant: 'standard',
    white: { username: 'White' },
    black: { username: 'Black' },
    result: '*',
    speed: 'rapid',
    timeControl: '600',
    rated: false,
    endTime: '',
    moves: [
      {
        ply: 1,
        color: 'white',
        san: move.san,
        from: move.from,
        to: move.to,
        uci: `${move.from}${move.to}`,
        fenBefore: move.before,
        fenAfter: move.after,
      },
    ],
    parseStatus: 'ready',
    profileKeys: [],
    firstImportedAt: '',
    lastImportedAt: '',
  };
}

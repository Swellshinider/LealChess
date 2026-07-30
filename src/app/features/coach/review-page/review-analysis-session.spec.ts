import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { ImportedGame } from '../domain/coach.types';
import {
  commitReviewMove,
  createReviewAnalysisSession,
  removeReviewVariation,
  restoreReviewAnalysisSession,
  selectReviewNode,
} from './review-analysis-session';

describe('review analysis session', () => {
  it('seeds an immutable mainline and selects duplicate moves', () => {
    const session = createReviewAnalysisSession(game());
    const root = session.nodes[session.rootId]!;
    const first = session.nodes[root.children[0]!]!;

    expect(first).toMatchObject({ san: 'e4', source: 'imported', importedPly: 1 });
    const duplicate = commitReviewMove(session, { from: 'e2', to: 'e4' });
    expect(duplicate.created).toBe(false);
    expect(duplicate.session.selectedNodeId).toBe(first.id);
  });

  it('supports nested branches and removes only a selected manual subtree', () => {
    let session = createReviewAnalysisSession(game());
    const root = session.nodes['root']!;
    session = selectReviewNode(session, root.children[0]!);
    const branch = commitReviewMove(session, { from: 'c7', to: 'c5' });
    const nested = commitReviewMove(branch.session, { from: 'g1', to: 'f3' });
    expect(nested.node.parentId).toBe(branch.node.id);

    const removed = removeReviewVariation(nested.session, branch.node.id);
    expect(removed.selectedNodeId).toBe(branch.node.parentId);
    expect(removed.nodes[branch.node.id]).toBeUndefined();
    expect(removed.nodes[nested.node.id]).toBeUndefined();

    const imported = removeReviewVariation(session, root.children[0]!);
    expect(imported).toBe(session);
  });

  it('rebuilds corrupt or stale game trees and retains branches across analysis upgrades', () => {
    const imported = game();
    let session = createReviewAnalysisSession(imported);
    session = commitReviewMove(session, { from: 'd2', to: 'd4' }).session;
    const upgraded = restoreReviewAnalysisSession(
      {
        ...session,
        analysisVersion: 'old',
        nodes: Object.fromEntries(
          Object.entries(session.nodes).map(([id, node]) => [
            id,
            {
              ...node,
              candidateDepth: 12,
              candidates: [
                {
                  rank: 1,
                  evaluation: { depth: 12, score: { kind: 'centipawn', value: 10 } },
                  firstMove: { from: 'e2', to: 'e4' },
                  san: ['e4'],
                },
              ],
            },
          ]),
        ),
      },
      imported,
    );
    expect(Object.values(upgraded.nodes).some((node) => node.source === 'manual')).toBe(true);
    expect(Object.values(upgraded.nodes).every((node) => node.candidates.length === 0)).toBe(true);

    const rebuilt = restoreReviewAnalysisSession(
      { ...session, mainlineFingerprint: 'different' },
      imported,
    );
    expect(Object.values(rebuilt.nodes).some((node) => node.source === 'manual')).toBe(false);
  });
});

function game(): ImportedGame {
  const chess = new Chess();
  const moves = ['e4', 'e5', 'Nf3'].map((san, index) => {
    const move = chess.move(san);
    return {
      ply: index + 1,
      color: move.color === 'w' ? ('white' as const) : ('black' as const),
      san: move.san,
      from: move.from,
      to: move.to,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      fenBefore: move.before,
      fenAfter: move.after,
    };
  });
  return {
    key: 'local:review',
    platform: 'local',
    platformGameId: 'review',
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
    moves,
    parseStatus: 'ready',
    profileKeys: [],
    firstImportedAt: '',
    lastImportedAt: '',
  };
}

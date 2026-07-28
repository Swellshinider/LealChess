import { STARTING_FEN } from '../../../core/game/game.types';
import type { TrainingPosition } from '../domain/coach.types';
import { commitPracticeMove, createPracticeSession, selectPracticeNode } from './practice-session';

describe('practice session', () => {
  it('keeps the first line and adds alternate branches from a selected ancestor', () => {
    const root = createPracticeSession(position());
    const first = commitPracticeMove(root, { from: 'e2', to: 'e4' });
    const reply = commitPracticeMove(first.session, { from: 'e7', to: 'e5' });
    const backAtRoot = selectPracticeNode(reply.session, reply.session.rootId);
    const alternate = commitPracticeMove(backAtRoot, { from: 'd2', to: 'd4' });

    expect(alternate.session.nodes['root']?.children).toEqual([first.node.id, alternate.node.id]);
    expect(alternate.session.nodes[first.node.id]?.children).toEqual([reply.node.id]);
    expect(first.node).toMatchObject({ san: 'e4', ply: 1, color: 'white' });
    expect(reply.node).toMatchObject({ san: 'e5', ply: 2, color: 'black' });
    expect(alternate.node).toMatchObject({ san: 'd4', ply: 1, color: 'white' });
  });

  it('selects an existing child instead of duplicating the same move', () => {
    const root = createPracticeSession(position());
    const first = commitPracticeMove(root, { from: 'e2', to: 'e4' });
    const backAtRoot = selectPracticeNode(first.session, first.session.rootId);
    const repeated = commitPracticeMove(backAtRoot, { from: 'e2', to: 'e4' });

    expect(repeated.created).toBe(false);
    expect(repeated.node.id).toBe(first.node.id);
    expect(Object.keys(repeated.session.nodes)).toHaveLength(2);
  });
});

function position(): TrainingPosition {
  return {
    importedGameKey: 'game',
    ply: 1,
    fen: STARTING_FEN,
    category: 'opening',
    classification: 'mistake',
    playedMove: 'd2d3',
    bestMove: 'e2e4',
    bestMoveSan: 'e4',
    principalVariation: [],
  };
}

import { Chess } from 'chess.js';
import { STARTING_FEN } from '../../core/game/game.types';
import {
  commitExplorerMove,
  createExplorerSession,
  createPgnExplorerSession,
  moveNumberLabel,
  selectExplorerNode,
} from './explorer-session';

describe('Explorer session', () => {
  it('preserves branches when a different move is played from an ancestor', () => {
    const root = createExplorerSession();
    const e4 = commitExplorerMove(root, { from: 'e2', to: 'e4' });
    const e5 = commitExplorerMove(e4.session, { from: 'e7', to: 'e5' });
    const back = selectExplorerNode(e5.session, root.rootId);
    const d4 = commitExplorerMove(back, { from: 'd2', to: 'd4' });

    expect(d4.session.nodes['root']?.children).toEqual([e4.node.id, d4.node.id]);
    expect(d4.session.nodes[e4.node.id]?.children).toEqual([e5.node.id]);
    expect(d4.session.selectedNodeId).toBe(d4.node.id);
  });

  it('reuses an existing continuation instead of duplicating it', () => {
    const root = createExplorerSession();
    const first = commitExplorerMove(root, { from: 'e2', to: 'e4' });
    const repeated = commitExplorerMove(selectExplorerNode(first.session, root.rootId), {
      from: 'e2',
      to: 'e4',
    });

    expect(repeated.created).toBe(false);
    expect(Object.keys(repeated.session.nodes)).toHaveLength(2);
  });

  it('builds and selects a complete imported mainline', () => {
    const chess = new Chess();
    const moves = ['e4', 'e5'].map((san) => {
      const before = chess.fen();
      const move = chess.move(san);
      return {
        move: { from: move.from, to: move.to },
        san: move.san,
        color: move.color === 'w' ? ('white' as const) : ('black' as const),
        fenBefore: before,
        fenAfter: chess.fen(),
      };
    });
    const session = createPgnExplorerSession(STARTING_FEN, moves);

    expect(session.batch).toMatchObject({ status: 'running', completed: 0, total: 2 });
    expect(session.nodes[session.selectedNodeId]?.san).toBe('e5');
  });

  it('derives move labels from the FEN side and fullmove fields', () => {
    expect(moveNumberLabel('8/8/8/8/8/8/4k3/4K3 w - - 0 12')).toBe('12.');
    expect(moveNumberLabel('8/8/8/8/8/8/4k3/4K3 b - - 0 12')).toBe('12…');
  });
});

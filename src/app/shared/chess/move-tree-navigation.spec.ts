import { describe, expect, it } from 'vitest';
import {
  EMPTY_MOVE_TREE_NAVIGATION,
  jumpToEndNodeId,
  jumpToStartNodeId,
  nextMoveNodeId,
  previousMoveNodeId,
  rememberMoveTreeSelection,
  type NavigableMoveTree,
} from './move-tree-navigation';

const tree: NavigableMoveTree = {
  rootId: 'root',
  nodes: {
    root: { id: 'root', parentId: null, children: ['a'] },
    a: { id: 'a', parentId: 'root', children: ['b', 'v'] },
    b: { id: 'b', parentId: 'a', children: [] },
    v: { id: 'v', parentId: 'a', children: ['w', 'x'] },
    w: { id: 'w', parentId: 'v', children: [] },
    x: { id: 'x', parentId: 'v', children: ['y'] },
    y: { id: 'y', parentId: 'x', children: [] },
  },
};

describe('move-tree navigation', () => {
  it('moves backward and returns along the remembered continuation', () => {
    const state = rememberMoveTreeSelection(tree, 'y', EMPTY_MOVE_TREE_NAVIGATION);

    expect(previousMoveNodeId(tree, 'y')).toBe('x');
    expect(nextMoveNodeId(tree, 'v', state)).toBe('x');
    expect(nextMoveNodeId(tree, 'a', state)).toBe('v');
  });

  it('jumps first to the nearest branch point and then to the root', () => {
    const state = rememberMoveTreeSelection(tree, 'y', EMPTY_MOVE_TREE_NAVIGATION);
    const branch = jumpToStartNodeId(tree, 'y', state);
    const root = jumpToStartNodeId(tree, branch.nodeId, branch.state);

    expect(branch.nodeId).toBe('v');
    expect(root.nodeId).toBe('root');
  });

  it('jumps first to the selected variation leaf and then to the mainline leaf', () => {
    const state = rememberMoveTreeSelection(tree, 'y', EMPTY_MOVE_TREE_NAVIGATION);
    const branchEnd = jumpToEndNodeId(tree, 'v', state);
    const mainlineEnd = jumpToEndNodeId(tree, branchEnd.nodeId, branchEnd.state);

    expect(branchEnd.nodeId).toBe('y');
    expect(mainlineEnd.nodeId).toBe('b');
  });

  it('uses the first child when no continuation has been selected', () => {
    expect(nextMoveNodeId(tree, 'v', EMPTY_MOVE_TREE_NAVIGATION)).toBe('w');
  });
});

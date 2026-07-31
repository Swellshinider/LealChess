export interface NavigableMoveNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly children: readonly string[];
}

export interface NavigableMoveTree {
  readonly rootId: string;
  readonly nodes: Readonly<Record<string, NavigableMoveNode>>;
}

export interface MoveTreeNavigationState {
  readonly preferredChildren: Readonly<Record<string, string>>;
  readonly jump: { readonly action: 'start' | 'end'; readonly destinationId: string } | null;
}

export const EMPTY_MOVE_TREE_NAVIGATION: MoveTreeNavigationState = {
  preferredChildren: {},
  jump: null,
};

export function rememberMoveTreeSelection(
  tree: NavigableMoveTree,
  nodeId: string,
  state: MoveTreeNavigationState,
): MoveTreeNavigationState {
  const preferredChildren = { ...state.preferredChildren };
  let node = tree.nodes[nodeId];
  while (node?.parentId) {
    preferredChildren[node.parentId] = node.id;
    node = tree.nodes[node.parentId];
  }
  return { preferredChildren, jump: null };
}

export function previousMoveNodeId(tree: NavigableMoveTree, nodeId: string): string | null {
  return tree.nodes[nodeId]?.parentId ?? null;
}

export function nextMoveNodeId(
  tree: NavigableMoveTree,
  nodeId: string,
  state: MoveTreeNavigationState,
): string | null {
  const node = tree.nodes[nodeId];
  if (!node) return null;
  const preferred = state.preferredChildren[nodeId];
  return preferred && node.children.includes(preferred) ? preferred : (node.children[0] ?? null);
}

export function jumpToStartNodeId(
  tree: NavigableMoveTree,
  nodeId: string,
  state: MoveTreeNavigationState,
): { nodeId: string; state: MoveTreeNavigationState } {
  const repeat = state.jump?.action === 'start' && state.jump.destinationId === nodeId;
  const destinationId = repeat ? tree.rootId : (nearestBranchPoint(tree, nodeId) ?? tree.rootId);
  return {
    nodeId: destinationId,
    state: { ...state, jump: { action: 'start', destinationId } },
  };
}

export function jumpToEndNodeId(
  tree: NavigableMoveTree,
  nodeId: string,
  state: MoveTreeNavigationState,
): { nodeId: string; state: MoveTreeNavigationState } {
  const repeat = state.jump?.action === 'end' && state.jump.destinationId === nodeId;
  const destinationId = repeat
    ? primaryLeaf(tree, tree.rootId)
    : preferredLeaf(tree, nodeId, state);
  return {
    nodeId: destinationId,
    state: { ...state, jump: { action: 'end', destinationId } },
  };
}

function nearestBranchPoint(tree: NavigableMoveTree, nodeId: string): string | null {
  let node = tree.nodes[nodeId];
  while (node?.parentId) {
    const parent = tree.nodes[node.parentId];
    if (!parent) return null;
    if (parent.children[0] !== node.id) return parent.id;
    node = parent;
  }
  return null;
}

function preferredLeaf(
  tree: NavigableMoveTree,
  nodeId: string,
  state: MoveTreeNavigationState,
): string {
  let current = nodeId;
  let next = nextMoveNodeId(tree, current, state);
  while (next) {
    current = next;
    next = nextMoveNodeId(tree, current, state);
  }
  return current;
}

function primaryLeaf(tree: NavigableMoveTree, nodeId: string): string {
  let current = nodeId;
  let next = tree.nodes[current]?.children[0];
  while (next) {
    current = next;
    next = tree.nodes[current]?.children[0];
  }
  return current;
}

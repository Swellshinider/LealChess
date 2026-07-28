import { Chess } from 'chess.js';
import type { MoveInput } from '../../../core/game/game.types';
import type { TrainingPosition } from '../domain/coach.types';
import type { PracticeMoveCommit, PracticeSession, PracticeVariationNode } from './practice.types';
import { moveToUci } from '../analysis/analysis-rules';

const ROOT_ID = 'root';

export function practiceSessionKey(position: TrainingPosition): string {
  return `${position.importedGameKey}:${position.ply}`;
}

export function createPracticeSession(position: TrainingPosition): PracticeSession {
  const root: PracticeVariationNode = {
    id: ROOT_ID,
    parentId: null,
    fen: position.fen,
    ply: position.ply - 1,
    children: [],
    candidates: [],
  };
  return {
    key: practiceSessionKey(position),
    position,
    rootId: ROOT_ID,
    selectedNodeId: ROOT_ID,
    nodes: { [ROOT_ID]: root },
  };
}

export function selectPracticeNode(session: PracticeSession, nodeId: string): PracticeSession {
  if (!session.nodes[nodeId]) return session;
  return { ...session, selectedNodeId: nodeId };
}

export function commitPracticeMove(session: PracticeSession, move: MoveInput): PracticeMoveCommit {
  const parent = session.nodes[session.selectedNodeId];
  if (!parent) throw new Error('The selected practice position is unavailable.');
  const chess = new Chess(parent.fen);
  const played = chess.move(move);
  const uci = moveToUci(move);
  const existingId = parent.children.find(
    (childId) => moveToUci(session.nodes[childId]!.move!) === uci,
  );
  if (existingId) {
    const node = session.nodes[existingId]!;
    return {
      session: { ...session, selectedNodeId: existingId },
      node,
      created: false,
    };
  }

  const id = `${parent.id}/${uci}`;
  const node: PracticeVariationNode = {
    id,
    parentId: parent.id,
    fen: chess.fen(),
    ply: parent.ply + 1,
    children: [],
    move,
    san: played.san,
    color: played.color === 'w' ? 'white' : 'black',
    candidates: [],
  };
  return {
    session: {
      ...session,
      selectedNodeId: id,
      nodes: {
        ...session.nodes,
        [parent.id]: { ...parent, children: [...parent.children, id] },
        [id]: node,
      },
    },
    node,
    created: true,
  };
}

export function updatePracticeNode(
  session: PracticeSession,
  nodeId: string,
  changes: Partial<PracticeVariationNode>,
): PracticeSession {
  const node = session.nodes[nodeId];
  if (!node) return session;
  return {
    ...session,
    nodes: {
      ...session.nodes,
      [nodeId]: { ...node, ...changes },
    },
  };
}

export function practiceAncestorIds(session: PracticeSession, nodeId: string): Set<string> {
  const ancestors = new Set<string>();
  let current: PracticeVariationNode | undefined = session.nodes[nodeId];
  while (current) {
    ancestors.add(current.id);
    current = current.parentId ? session.nodes[current.parentId] : undefined;
  }
  return ancestors;
}

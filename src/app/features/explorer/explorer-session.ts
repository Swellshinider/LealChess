import { Chess } from 'chess.js';
import { STARTING_FEN, type MoveInput } from '../../core/game/game.types';
import { moveToUci } from '../coach/analysis/analysis-rules';
import {
  EXPLORER_ANALYSIS_VERSION,
  EXPLORER_SESSION_SCHEMA_VERSION,
  type ExplorerMoveNode,
  type ExplorerPgnMove,
  type ExplorerSession,
  type ExplorerSource,
} from './explorer.types';

const ROOT_ID = 'root';

export function createExplorerSession(
  rootFen = STARTING_FEN,
  source: ExplorerSource = 'starting-position',
): ExplorerSession {
  const root: ExplorerMoveNode = {
    id: ROOT_ID,
    parentId: null,
    fen: rootFen,
    ply: 0,
    children: [],
    candidates: [],
  };
  return {
    id: 'active',
    schemaVersion: EXPLORER_SESSION_SCHEMA_VERSION,
    analysisVersion: EXPLORER_ANALYSIS_VERSION,
    source,
    rootFen,
    rootId: ROOT_ID,
    selectedNodeId: ROOT_ID,
    nodes: { [ROOT_ID]: root },
    orientation: rootFen.split(' ')[1] === 'b' ? 'black' : 'white',
    batch: { status: 'idle', completed: 0, total: 0 },
    updatedAt: new Date().toISOString(),
  };
}

export function createPgnExplorerSession(
  rootFen: string,
  moves: readonly ExplorerPgnMove[],
): ExplorerSession {
  let session = createExplorerSession(rootFen, 'pgn');
  for (const imported of moves) {
    const committed = commitExplorerMove(session, imported.move, 'imported');
    session = committed.session;
  }
  return touchSession({
    ...session,
    batch: {
      status: moves.length ? 'running' : 'complete',
      completed: 0,
      total: moves.length,
    },
  });
}

export function selectExplorerNode(session: ExplorerSession, nodeId: string): ExplorerSession {
  if (!session.nodes[nodeId]) return session;
  return touchSession({ ...session, selectedNodeId: nodeId });
}

export function commitExplorerMove(
  session: ExplorerSession,
  move: MoveInput,
  source: 'imported' | 'manual' = 'manual',
): { session: ExplorerSession; node: ExplorerMoveNode; created: boolean } {
  const parent = session.nodes[session.selectedNodeId];
  if (!parent) throw new Error('The selected Explorer position is unavailable.');
  const chess = new Chess(parent.fen);
  const played = chess.move(move);
  const uci = moveToUci(move);
  const existingId = parent.children.find(
    (childId) => moveToUci(session.nodes[childId]!.move!) === uci,
  );
  if (existingId) {
    return {
      session: selectExplorerNode(session, existingId),
      node: session.nodes[existingId]!,
      created: false,
    };
  }

  const id = `${parent.id}/${uci}`;
  const node: ExplorerMoveNode = {
    id,
    parentId: parent.id,
    fen: chess.fen(),
    ply: parent.ply + 1,
    children: [],
    move,
    san: played.san,
    color: played.color === 'w' ? 'white' : 'black',
    source,
    candidates: [],
  };
  const next: ExplorerSession = {
    ...session,
    selectedNodeId: id,
    nodes: {
      ...session.nodes,
      [parent.id]: { ...parent, children: [...parent.children, id] },
      [id]: node,
    },
  };
  return { session: touchSession(next), node, created: true };
}

export function updateExplorerNode(
  session: ExplorerSession,
  nodeId: string,
  changes: Partial<ExplorerMoveNode>,
): ExplorerSession {
  const node = session.nodes[nodeId];
  if (!node) return session;
  return touchSession({
    ...session,
    nodes: { ...session.nodes, [nodeId]: { ...node, ...changes } },
  });
}

export function importedExplorerNodes(session: ExplorerSession): ExplorerMoveNode[] {
  return Object.values(session.nodes)
    .filter((node) => node.source === 'imported')
    .sort((left, right) => left.ply - right.ply);
}

export function explorerAncestorIds(session: ExplorerSession, nodeId: string): Set<string> {
  const result = new Set<string>();
  let node: ExplorerMoveNode | undefined = session.nodes[nodeId];
  while (node) {
    result.add(node.id);
    node = node.parentId ? session.nodes[node.parentId] : undefined;
  }
  return result;
}

export function moveNumberLabel(fenBefore: string): string {
  const fields = fenBefore.split(' ');
  return `${fields[5] ?? '1'}${fields[1] === 'b' ? '…' : '.'}`;
}

export function resetAnalysisVersion(session: ExplorerSession): ExplorerSession {
  if (session.analysisVersion === EXPLORER_ANALYSIS_VERSION) return session;
  const nodes = Object.fromEntries(
    Object.entries(session.nodes).map(([id, node]) => [
      id,
      {
        ...node,
        assessment: undefined,
        candidates: [],
        candidateDepth: undefined,
        analysisError: undefined,
      },
    ]),
  );
  const imported = Object.values(nodes).filter((node) => node.source === 'imported');
  return touchSession({
    ...session,
    analysisVersion: EXPLORER_ANALYSIS_VERSION,
    nodes,
    batch: {
      status: imported.length ? 'running' : 'idle',
      completed: 0,
      total: imported.length,
    },
  });
}

function touchSession(session: ExplorerSession): ExplorerSession {
  return { ...session, updatedAt: new Date().toISOString() };
}

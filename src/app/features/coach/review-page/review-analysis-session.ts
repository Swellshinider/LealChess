import { Chess } from 'chess.js';
import type { MoveInput } from '../../../core/game/game.types';
import type { ImportedGame } from '../domain/coach.types';
import {
  REVIEW_ANALYSIS_SESSION_SCHEMA_VERSION,
  REVIEW_ANALYSIS_VERSION,
  type ReviewAnalysisSession,
  type ReviewMoveNode,
} from './review-analysis-session.types';
import { moveToUci } from '../../../core/game/chess-move';

const ROOT_ID = 'root' as const;

export function reviewMainlineFingerprint(game: ImportedGame): string {
  return game.moves.map((move) => `${move.uci}:${move.fenAfter}`).join('|');
}

export function createReviewAnalysisSession(game: ImportedGame): ReviewAnalysisSession {
  const rootFen = game.moves[0]?.fenBefore;
  if (!rootFen) throw new Error('The imported game has no playable position.');
  const root: ReviewMoveNode = {
    id: ROOT_ID,
    parentId: null,
    children: [],
    fen: rootFen,
    ply: 0,
    importedPly: 0,
    candidates: [],
  };
  let session: ReviewAnalysisSession = {
    importedGameKey: game.key,
    schemaVersion: REVIEW_ANALYSIS_SESSION_SCHEMA_VERSION,
    analysisVersion: REVIEW_ANALYSIS_VERSION,
    mainlineFingerprint: reviewMainlineFingerprint(game),
    rootId: ROOT_ID,
    selectedNodeId: ROOT_ID,
    nodes: { [ROOT_ID]: root },
    updatedAt: new Date().toISOString(),
  };
  for (const imported of game.moves) {
    session = commitReviewMove(
      session,
      {
        from: imported.from,
        to: imported.to,
        ...(imported.uci[4] ? { promotion: imported.uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
      },
      'imported',
      imported.ply,
    ).session;
  }
  return { ...session, selectedNodeId: ROOT_ID };
}

export function selectReviewNode(
  session: ReviewAnalysisSession,
  nodeId: string,
): ReviewAnalysisSession {
  return session.nodes[nodeId] ? touch({ ...session, selectedNodeId: nodeId }) : session;
}

export function commitReviewMove(
  session: ReviewAnalysisSession,
  move: MoveInput,
  source: 'imported' | 'manual' = 'manual',
  importedPly?: number,
): { session: ReviewAnalysisSession; node: ReviewMoveNode; created: boolean } {
  const parent = session.nodes[session.selectedNodeId];
  if (!parent) throw new Error('The selected review position is unavailable.');
  const chess = new Chess(parent.fen);
  const played = chess.move(move);
  const uci = moveToUci(move);
  const existingId = parent.children.find(
    (childId) => moveToUci(session.nodes[childId]!.move!) === uci,
  );
  if (existingId) {
    return {
      session: selectReviewNode(session, existingId),
      node: session.nodes[existingId]!,
      created: false,
    };
  }
  if (
    source === 'imported' &&
    parent.children.some((id) => session.nodes[id]?.source === 'imported')
  ) {
    throw new Error('The imported mainline cannot be replaced.');
  }
  const id = `${parent.id}/${uci}`;
  const node: ReviewMoveNode = {
    id,
    parentId: parent.id,
    children: [],
    fen: chess.fen(),
    ply: parent.ply + 1,
    move,
    san: played.san,
    color: played.color === 'w' ? 'white' : 'black',
    source,
    ...(source === 'imported' ? { importedPly } : {}),
    candidates: [],
  };
  return {
    session: touch({
      ...session,
      selectedNodeId: id,
      nodes: {
        ...session.nodes,
        [parent.id]: { ...parent, children: [...parent.children, id] },
        [id]: node,
      },
    }),
    node,
    created: true,
  };
}

export function updateReviewNode(
  session: ReviewAnalysisSession,
  nodeId: string,
  changes: Partial<ReviewMoveNode>,
): ReviewAnalysisSession {
  const node = session.nodes[nodeId];
  if (!node) return session;
  return touch({
    ...session,
    nodes: { ...session.nodes, [nodeId]: { ...node, ...changes } },
  });
}

export function removeReviewVariation(
  session: ReviewAnalysisSession,
  nodeId: string,
): ReviewAnalysisSession {
  const node = session.nodes[nodeId];
  if (!node || node.source !== 'manual' || !node.parentId) return session;
  const removed = new Set<string>();
  const visit = (id: string): void => {
    removed.add(id);
    for (const child of session.nodes[id]?.children ?? []) visit(child);
  };
  visit(nodeId);
  const nodes = Object.fromEntries(
    Object.entries(session.nodes)
      .filter(([id]) => !removed.has(id))
      .map(([id, value]) => [
        id,
        id === node.parentId
          ? { ...value, children: value.children.filter((child) => child !== nodeId) }
          : value,
      ]),
  );
  return touch({ ...session, selectedNodeId: node.parentId, nodes });
}

export function reviewAncestorIds(session: ReviewAnalysisSession): Set<string> {
  const result = new Set<string>();
  let current: ReviewMoveNode | undefined = session.nodes[session.selectedNodeId];
  while (current) {
    result.add(current.id);
    current = current.parentId ? session.nodes[current.parentId] : undefined;
  }
  return result;
}

export function restoreReviewAnalysisSession(
  value: unknown,
  game: ImportedGame,
): ReviewAnalysisSession {
  if (!isValidSession(value, game)) return createReviewAnalysisSession(game);
  if (value.analysisVersion === REVIEW_ANALYSIS_VERSION) return value;
  return touch({
    ...value,
    analysisVersion: REVIEW_ANALYSIS_VERSION,
    nodes: Object.fromEntries(
      Object.entries(value.nodes).map(([id, node]) => [
        id,
        { ...node, candidates: [], candidateDepth: undefined, analysisError: undefined },
      ]),
    ),
  });
}

function isValidSession(value: unknown, game: ImportedGame): value is ReviewAnalysisSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<ReviewAnalysisSession>;
  if (
    session.schemaVersion !== REVIEW_ANALYSIS_SESSION_SCHEMA_VERSION ||
    session.importedGameKey !== game.key ||
    session.mainlineFingerprint !== reviewMainlineFingerprint(game) ||
    session.rootId !== ROOT_ID ||
    !session.nodes ||
    !session.selectedNodeId ||
    !session.nodes[session.rootId] ||
    !session.nodes[session.selectedNodeId]
  )
    return false;
  if (session.nodes[ROOT_ID]?.fen !== game.moves[0]?.fenBefore) return false;
  const seen = new Set<string>();
  const visit = (id: string, parentFen?: string): boolean => {
    if (seen.has(id)) return false;
    const node = session.nodes![id];
    if (
      !node ||
      node.id !== id ||
      typeof node.fen !== 'string' ||
      typeof node.ply !== 'number' ||
      !Array.isArray(node.children) ||
      !Array.isArray(node.candidates) ||
      !node.candidates.every(isCandidateLine)
    )
      return false;
    if (parentFen && node.move) {
      try {
        const chess = new Chess(parentFen);
        chess.move(node.move);
        if (chess.fen() !== node.fen) return false;
      } catch {
        return false;
      }
    }
    seen.add(id);
    return node.children.every(
      (childId) => session.nodes![childId]?.parentId === id && visit(childId, node.fen),
    );
  };
  if (!visit(ROOT_ID) || seen.size !== Object.keys(session.nodes).length) return false;
  const imported = game.moves.map((move) => move.uci);
  let node = session.nodes[ROOT_ID];
  for (const [index, uci] of imported.entries()) {
    const childId = node.children.find((id) => session.nodes![id]?.source === 'imported');
    if (!childId || moveToUci(session.nodes[childId]!.move!) !== uci) return false;
    node = session.nodes[childId]!;
    if (
      node.fen !== game.moves[index]?.fenAfter ||
      node.san !== game.moves[index]?.san ||
      node.importedPly !== index + 1
    )
      return false;
  }
  return true;
}

function isCandidateLine(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const line = value as Record<string, unknown>;
  const evaluation = line['evaluation'];
  const move = line['firstMove'];
  return (
    typeof line['rank'] === 'number' &&
    Array.isArray(line['san']) &&
    line['san'].every((san) => typeof san === 'string') &&
    typeof evaluation === 'object' &&
    evaluation !== null &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as Record<string, unknown>)['from'] === 'string' &&
    typeof (move as Record<string, unknown>)['to'] === 'string'
  );
}

function touch(session: ReviewAnalysisSession): ReviewAnalysisSession {
  return { ...session, updatedAt: new Date().toISOString() };
}

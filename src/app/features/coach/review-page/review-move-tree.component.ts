import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { GameAnalysis, ReviewMoveClassification } from '../domain/coach.types';
import type { ReviewAnalysisSession, ReviewMoveNode } from './review-analysis-session.types';
import { reviewAncestorIds } from './review-analysis-session';

interface MainlineScoreEntry {
  kind: 'mainline';
  node: ReviewMoveNode;
}

interface VariationScoreEntry {
  kind: 'variation';
  id: string;
  nodes: ReviewMoveNode[];
  variationDepth: number;
}

type ScoreEntry = MainlineScoreEntry | VariationScoreEntry;

@Component({
  selector: 'app-review-move-tree',
  templateUrl: './review-move-tree.component.html',
  styleUrl: './review-move-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewMoveTreeComponent {
  readonly session = input.required<ReviewAnalysisSession>();
  readonly analysis = input<GameAnalysis | null>(null);
  readonly nodeSelected = output<string>();
  readonly removeRequested = output<string>();

  protected readonly entries = computed(() => flattenScore(this.session()));
  protected readonly path = computed(() => reviewAncestorIds(this.session()));

  protected classification(node: ReviewMoveNode): ReviewMoveClassification | undefined {
    if (node.source !== 'imported' || !node.importedPly) return undefined;
    const analysis = this.analysis();
    return (analysis?.reviewMoves ?? analysis?.moves)?.find((move) => move.ply === node.importedPly)
      ?.reviewClassification;
  }

  protected classificationLabel(node: ReviewMoveNode): string {
    const value = this.classification(node);
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }

  protected moveNumber(node: ReviewMoveNode): string {
    return `${Math.ceil(node.ply / 2)}${node.color === 'black' ? '…' : '.'}`;
  }

  protected variationMoveNumber(nodes: ReviewMoveNode[], index: number): string {
    const node = nodes[index]!;
    const previous = nodes[index - 1];
    if (
      node.color === 'black' &&
      previous?.color === 'white' &&
      Math.ceil(previous.ply / 2) === Math.ceil(node.ply / 2)
    ) {
      return '';
    }
    return this.moveNumber(node);
  }
}

function flattenScore(session: ReviewAnalysisSession): ScoreEntry[] {
  const entries: ScoreEntry[] = [];
  const visitVariation = (nodeId: string, variationDepth: number): void => {
    const nodes: ReviewMoveNode[] = [];
    let current: ReviewMoveNode | undefined = session.nodes[nodeId];
    while (current?.source === 'manual') {
      nodes.push(current);
      current = current.children[0] ? session.nodes[current.children[0]] : undefined;
    }
    if (!nodes.length) return;
    entries.push({ kind: 'variation', id: nodeId, nodes, variationDepth });
    for (const node of nodes) {
      for (const childId of node.children.slice(1)) {
        visitVariation(childId, variationDepth + 1);
      }
    }
  };
  const visitMainline = (nodeId: string): void => {
    const node = session.nodes[nodeId];
    if (!node) return;
    if (nodeId !== session.rootId) entries.push({ kind: 'mainline', node });
    for (const childId of node.children) {
      if (session.nodes[childId]?.source === 'manual') visitVariation(childId, 1);
    }
    const imported = node.children.find((id) => session.nodes[id]?.source === 'imported');
    if (imported) visitMainline(imported);
  };
  visitMainline(session.rootId);
  return entries;
}

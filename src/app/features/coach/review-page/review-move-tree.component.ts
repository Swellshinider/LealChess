import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { GameAnalysis, ReviewMoveClassification } from '../domain/coach.types';
import type { ReviewAnalysisSession, ReviewMoveNode } from './review-analysis-session.types';
import { reviewAncestorIds } from './review-analysis-session';

interface ScoreEntry {
  node: ReviewMoveNode;
  variationDepth: number;
}

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
}

function flattenScore(session: ReviewAnalysisSession): ScoreEntry[] {
  const entries: ScoreEntry[] = [];
  const visit = (nodeId: string, variationDepth: number): void => {
    const node = session.nodes[nodeId];
    if (!node) return;
    if (nodeId !== session.rootId) entries.push({ node, variationDepth });
    const imported = node.children.filter((id) => session.nodes[id]?.source === 'imported');
    const manual = node.children.filter((id) => session.nodes[id]?.source === 'manual');
    manual.forEach((child, index) =>
      visit(child, variationDepth + (node.source === 'manual' && index === 0 ? 0 : 1)),
    );
    for (const child of imported) visit(child, variationDepth);
  };
  visit(session.rootId, 0);
  return entries;
}

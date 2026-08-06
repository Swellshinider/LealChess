import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { BoardTheme } from '../../../core/game/game.types';
import type { ChessColor } from '../../../shared/chess/chess.types';
import type { GameAnalysis } from '../domain/coach.types';
import type { ReviewMoveClassification } from '../../../core/analysis/move-classification.types';
import type { ReviewAnalysisSession, ReviewMoveNode } from './review-analysis-session.types';
import { reviewAncestorIds } from './review-analysis-session';
import {
  ReviewMovePreviewComponent,
  type ReviewMovePreviewPosition,
} from './review-move-preview.component';

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
  imports: [ReviewMovePreviewComponent],
  templateUrl: './review-move-tree.component.html',
  styleUrl: './review-move-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewMoveTreeComponent {
  readonly session = input.required<ReviewAnalysisSession>();
  readonly analysis = input<GameAnalysis | null>(null);
  readonly orientation = input.required<ChessColor>();
  readonly boardTheme = input.required<BoardTheme>();
  readonly nodeSelected = output<string>();
  readonly removeRequested = output<string>();

  protected readonly entries = computed(() => flattenScore(this.session()));
  protected readonly path = computed(() => reviewAncestorIds(this.session()));
  protected readonly movePreview = signal<{
    node: ReviewMoveNode;
    position: ReviewMovePreviewPosition;
  } | null>(null);

  @HostListener('window:resize')
  @HostListener('document:wheel')
  protected clearMovePreview(): void {
    this.movePreview.set(null);
  }

  protected showMovePreview(node: ReviewMoveNode, event: Event): void {
    if (
      event.type.startsWith('pointer') &&
      typeof matchMedia === 'function' &&
      !matchMedia('(hover: hover)').matches
    ) {
      return;
    }
    const anchor = event.currentTarget;
    if (!(anchor instanceof HTMLElement) || typeof window === 'undefined') return;
    const bounds = anchor.getBoundingClientRect();
    const width = 224;
    const height = 264;
    const gap = 12;
    const viewportPadding = 12;
    let left = bounds.left - width - gap;
    if (left < viewportPadding) left = bounds.right + gap;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - width - viewportPadding));
    const top = Math.max(
      viewportPadding,
      Math.min(
        bounds.top + bounds.height / 2 - height / 2,
        window.innerHeight - height - viewportPadding,
      ),
    );
    this.movePreview.set({ node, position: { left, top } });
  }

  protected hideMovePreview(nodeId: string): void {
    if (this.movePreview()?.node.id === nodeId) this.clearMovePreview();
  }

  protected selectNode(nodeId: string): void {
    this.clearMovePreview();
    this.nodeSelected.emit(nodeId);
  }

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

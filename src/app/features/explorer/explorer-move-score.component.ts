import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { BoardTheme } from '../../core/game/game.types';
import type { ChessColor } from '../../shared/chess/chess.types';
import { explorerAncestorIds, moveNumberLabel } from './explorer-session';
import type { ExplorerMoveNode, ExplorerSession } from './explorer.types';
import {
  ExplorerMovePreviewComponent,
  type ExplorerMovePreviewPosition,
} from './explorer-move-preview.component';

export interface ExplorerMainlineScoreEntry {
  kind: 'mainline';
  node: ExplorerMoveNode;
}

export interface ExplorerVariationScoreEntry {
  kind: 'variation';
  id: string;
  nodes: ExplorerMoveNode[];
  variationDepth: number;
}

export type ExplorerScoreEntry = ExplorerMainlineScoreEntry | ExplorerVariationScoreEntry;

@Component({
  selector: 'app-explorer-move-score',
  imports: [ExplorerMovePreviewComponent],
  templateUrl: './explorer-move-score.component.html',
  styleUrl: './explorer-move-score.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerMoveScoreComponent {
  readonly session = input.required<ExplorerSession>();
  readonly orientation = input.required<ChessColor>();
  readonly boardTheme = input.required<BoardTheme>();
  readonly nodeSelected = output<string>();

  protected readonly entries = computed(() => explorerScoreEntries(this.session()));
  protected readonly selectedPath = computed(() =>
    explorerAncestorIds(this.session(), this.session().selectedNodeId),
  );
  protected readonly movePreview = signal<{
    node: ExplorerMoveNode;
    position: ExplorerMovePreviewPosition;
  } | null>(null);

  @HostListener('window:resize')
  @HostListener('document:wheel')
  protected clearMovePreview(): void {
    this.movePreview.set(null);
  }

  protected showMovePreview(node: ExplorerMoveNode, event: Event): void {
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

  protected moveNumber(node: ExplorerMoveNode): string {
    const parent = node.parentId ? this.session().nodes[node.parentId] : undefined;
    return parent ? moveNumberLabel(parent.fen) : '';
  }

  protected variationMoveNumber(nodes: ExplorerMoveNode[], index: number): string {
    const node = nodes[index]!;
    const previous = nodes[index - 1];
    if (node.color === 'black' && previous?.color === 'white') return '';
    return this.moveNumber(node);
  }

  protected classificationLabel(node: ExplorerMoveNode): string {
    const value = node.assessment?.classification;
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }
}

export function explorerPrimaryChildId(
  session: ExplorerSession,
  node: ExplorerMoveNode,
): string | undefined {
  return (
    node.children.find((childId) => session.nodes[childId]?.source === 'imported') ??
    node.children[0]
  );
}

export function explorerScoreEntries(session: ExplorerSession): ExplorerScoreEntry[] {
  const entries: ExplorerScoreEntry[] = [];

  const visitVariation = (nodeId: string, variationDepth: number): void => {
    const nodes: ExplorerMoveNode[] = [];
    const nested: string[] = [];
    let current: ExplorerMoveNode | undefined = session.nodes[nodeId];
    while (current) {
      nodes.push(current);
      const primaryId = explorerPrimaryChildId(session, current);
      for (const childId of current.children) {
        if (childId !== primaryId) nested.push(childId);
      }
      current = primaryId ? session.nodes[primaryId] : undefined;
    }
    if (nodes.length) entries.push({ kind: 'variation', id: nodeId, nodes, variationDepth });
    for (const childId of nested) visitVariation(childId, variationDepth + 1);
  };

  let current: ExplorerMoveNode | undefined = session.nodes[session.rootId];
  while (current) {
    if (current.id !== session.rootId) entries.push({ kind: 'mainline', node: current });
    const primaryId = explorerPrimaryChildId(session, current);
    for (const childId of current.children) {
      if (childId !== primaryId) visitVariation(childId, 1);
    }
    current = primaryId ? session.nodes[primaryId] : undefined;
  }
  return entries;
}

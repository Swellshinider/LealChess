import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { PracticeSession, PracticeVariationNode } from './practice.types';
import { practiceAncestorIds } from './practice-session';

@Component({
  selector: 'app-practice-move-tree',
  imports: [NgTemplateOutlet],
  templateUrl: './practice-move-tree.component.html',
  styleUrl: './practice-move-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PracticeMoveTreeComponent {
  @Input({ required: true }) session!: PracticeSession;
  @Output() readonly nodeSelected = new EventEmitter<string>();

  protected node(id: string): PracticeVariationNode {
    return this.session.nodes[id]!;
  }

  protected children(id: string): PracticeVariationNode[] {
    return this.node(id).children.map((childId) => this.node(childId));
  }

  protected isSelected(id: string): boolean {
    return this.session.selectedNodeId === id;
  }

  protected isOnSelectedLine(id: string): boolean {
    return practiceAncestorIds(this.session, this.session.selectedNodeId).has(id);
  }

  protected moveNumber(ply: number): string {
    return `${Math.ceil(ply / 2)}${ply % 2 === 0 ? '…' : '.'}`;
  }

  protected classificationLabel(node: PracticeVariationNode): string {
    const classification = node.assessment?.classification;
    return classification
      ? classification.charAt(0).toUpperCase() + classification.slice(1)
      : 'Analysis pending';
  }
}

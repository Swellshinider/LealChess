import type { ReviewLiveAnalysisState } from './review-live-analysis.service';
import type { ReviewCandidateLine, ReviewMoveNode } from './review-analysis-session.types';

/**
 * Engine arrows for the analysis board. A hovered candidate wins; otherwise variation nodes
 * show every live candidate line, and mainline nodes show none (they use coach idea arrows).
 */
export function analysisCandidateArrows(
  node: Pick<ReviewMoveNode, 'id' | 'source'> | null | undefined,
  previewed: ReviewCandidateLine | null,
  live: ReviewLiveAnalysisState,
): ReviewCandidateLine[] {
  if (previewed) return [previewed];
  if (node?.source !== 'manual' || live.nodeId !== node.id) return [];
  return live.candidates;
}

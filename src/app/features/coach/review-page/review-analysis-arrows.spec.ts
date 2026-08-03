import { describe, expect, it } from 'vitest';
import { analysisCandidateArrows } from './review-analysis-arrows';
import type { ReviewLiveAnalysisState } from './review-live-analysis.service';
import type { ReviewCandidateLine, ReviewMoveNode } from './review-analysis-session.types';

describe('analysisCandidateArrows', () => {
  const line = (rank: number): ReviewCandidateLine => ({
    rank,
    evaluation: { depth: 16, score: { kind: 'centipawn', value: 10 * rank } },
    firstMove: { from: 'e2', to: 'e4' },
    san: ['e4'],
  });

  function node(source: ReviewMoveNode['source']): Pick<ReviewMoveNode, 'id' | 'source'> {
    return { id: 'root/e2e4', source };
  }

  function live(
    nodeId: string | undefined,
    candidates: ReviewCandidateLine[],
  ): ReviewLiveAnalysisState {
    return { phase: 'analyzing', nodeId, candidates };
  }

  it('shows every live candidate on a variation node when nothing is hovered', () => {
    const candidates = [line(1), line(2)];
    expect(analysisCandidateArrows(node('manual'), null, live('root/e2e4', candidates))).toBe(
      candidates,
    );
  });

  it('hides arrows while the live state still points at a different node', () => {
    expect(analysisCandidateArrows(node('manual'), null, live('root/d2d4', [line(1)]))).toEqual([]);
  });

  it('hides arrows on an imported mainline node', () => {
    expect(analysisCandidateArrows(node('imported'), null, live('root/e2e4', [line(1)]))).toEqual(
      [],
    );
  });

  it('hides arrows on the root node, which has no source', () => {
    expect(analysisCandidateArrows(node(undefined), null, live('root/e2e4', [line(1)]))).toEqual(
      [],
    );
  });

  it('shows only the hovered candidate, overriding a variation node', () => {
    const hovered = line(2);
    expect(
      analysisCandidateArrows(node('manual'), hovered, live('root/e2e4', [line(1), line(2)])),
    ).toEqual([hovered]);
  });

  it('shows only the hovered candidate, overriding a mainline node', () => {
    const hovered = line(1);
    expect(analysisCandidateArrows(node('imported'), hovered, live('root/e2e4', []))).toEqual([
      hovered,
    ]);
  });

  it('hides arrows on a variation node with no live candidates yet', () => {
    expect(analysisCandidateArrows(node('manual'), null, live('root/e2e4', []))).toEqual([]);
  });

  it('hides arrows when there is no selected node', () => {
    expect(analysisCandidateArrows(null, null, live('root/e2e4', [line(1)]))).toEqual([]);
    expect(analysisCandidateArrows(undefined, null, live('root/e2e4', [line(1)]))).toEqual([]);
  });
});

import type { Square } from 'chess.js';
import type { ChessColor } from '../../shared/chess/chess.types';

export type MoveClassification = 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export type ReviewMoveClassification =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

export type ConcernMoveClassification = Extract<
  ReviewMoveClassification,
  'inaccuracy' | 'mistake' | 'miss' | 'blunder'
>;

/**
 * The part of a played move that classification needs: enough to replay it and compare the
 * position before and after. Feature move types such as `ImportedMove` satisfy this structurally,
 * so classification stays independent of where the move came from.
 */
export interface ClassifiedMove {
  color: ChessColor;
  from: Square;
  to: Square;
  uci: string;
  fenBefore: string;
  fenAfter: string;
}

/**
 * Centipawn cut-offs used when the engine's best line was already losing and the played move walks
 * into a forced mate. Changing these values changes stored analysis fingerprints and re-runs every
 * saved review.
 */
export const FORCED_MATE_THRESHOLDS = {
  seriousError: -700,
  inaccuracy: -1000,
} as const;

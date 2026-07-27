export type LiveMoveClassification =
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

export interface ClassificationInput {
  book: boolean;
  playedBestMove: boolean;
  bestExpectedPoints: number;
  playedExpectedPoints: number;
  secondBestExpectedPoints?: number;
  soundSacrifice: boolean;
}

export function classifyLiveMove(input: ClassificationInput): LiveMoveClassification {
  const epsilon = 1e-9;
  if (input.book) return 'book';
  const loss = Math.max(0, input.bestExpectedPoints - input.playedExpectedPoints);
  if (
    loss <= 0.02 + epsilon &&
    input.soundSacrifice &&
    input.playedExpectedPoints >= 0.4 &&
    input.bestExpectedPoints <= 0.9
  ) {
    return 'brilliant';
  }
  if (
    input.playedBestMove &&
    input.secondBestExpectedPoints !== undefined &&
    input.bestExpectedPoints - input.secondBestExpectedPoints >= 0.1 - epsilon &&
    input.playedExpectedPoints >= 0.4
  ) {
    return 'great';
  }
  if (input.playedBestMove) return 'best';
  if (input.bestExpectedPoints >= 0.7 && input.playedExpectedPoints <= 0.55) return 'miss';
  if (loss <= 0.02 + epsilon) return 'excellent';
  if (loss <= 0.05 + epsilon) return 'good';
  if (loss <= 0.1 + epsilon) return 'inaccuracy';
  if (loss <= 0.2 + epsilon) return 'mistake';
  return 'blunder';
}

export function classificationLabel(classification: LiveMoveClassification): string {
  return classification.charAt(0).toUpperCase() + classification.slice(1);
}

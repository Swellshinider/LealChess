export const ANALYSIS_SCHEMA_VERSION = 1;
export const ANALYSIS_DEPTH = 14;
export const ANALYSIS_ENGINE_VERSION = 'stockfish-18-lite-single@18.0.8';

export const CLASSIFICATION_THRESHOLDS = {
  inaccuracy: 50,
  mistake: 100,
  blunder: 200,
} as const;

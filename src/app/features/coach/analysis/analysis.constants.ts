export const ANALYSIS_SCHEMA_VERSION = 4;
export const ANALYSIS_DEPTH = 16;
export const ANALYSIS_ENGINE_VERSION = 'stockfish-18-single@18.0.8';

export const CLASSIFICATION_THRESHOLDS = {
  inaccuracy: 50,
  mistake: 100,
  blunder: 200,
} as const;

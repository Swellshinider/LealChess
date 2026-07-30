export const ANALYSIS_SCHEMA_VERSION = 5;
export const ANALYSIS_DEPTH = 16;
export const ANALYSIS_ENGINE_VERSION = 'stockfish-18-single@18.0.8';

export const FORCED_MATE_THRESHOLDS = {
  seriousError: -700,
  inaccuracy: -1000,
} as const;

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANALYSIS_PROFILES,
  analysisProfileFingerprint,
  normalizeAnalysisSettings,
} from './analysis-profiles';

describe('analysis profiles', () => {
  it('ships the former hard-coded behavior as workflow defaults', () => {
    expect(DEFAULT_ANALYSIS_PROFILES).toEqual({
      'game-review': { engineId: 'stockfish-18-full', depth: 16, lines: 2 },
      practice: { engineId: 'stockfish-18-full', depth: 14, lines: 3 },
      'live-analysis': { engineId: 'stockfish-18-full', depth: 16, lines: 3 },
      explorer: { engineId: 'stockfish-18-full', depth: 14, lines: 3 },
    });
  });

  it('normalizes corrupted fields independently without discarding valid choices', () => {
    const settings = normalizeAnalysisSettings({
      profiles: {
        practice: { engineId: 'stockfish-18-lite', depth: 99, lines: 5 },
        explorer: { engineId: 'unsupported', depth: 10, lines: 0 },
      },
    });

    expect(settings.profiles.practice).toEqual({
      engineId: 'stockfish-18-lite',
      depth: 14,
      lines: 5,
    });
    expect(settings.profiles.explorer).toEqual({
      engineId: 'stockfish-18-full',
      depth: 10,
      lines: 3,
    });
  });

  it('produces stable fingerprints for cache compatibility', () => {
    expect(analysisProfileFingerprint({ engineId: 'stockfish-18-lite', depth: 12, lines: 4 })).toBe(
      'analysis-profile-v1:stockfish-18-lite:d12:pv4',
    );
  });
});

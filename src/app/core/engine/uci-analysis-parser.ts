import type { EngineEvaluation } from '../../features/coach/domain/coach.types';

export interface UciAnalysisInfo {
  evaluation: EngineEvaluation;
  principalVariation: string[];
  bounded: boolean;
}

export function parseAnalysisInfo(line: string): UciAnalysisInfo | undefined {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return undefined;
  const depthIndex = tokens.indexOf('depth');
  const scoreIndex = tokens.indexOf('score');
  if (depthIndex < 0 || scoreIndex < 0) return undefined;
  const depth = Number(tokens[depthIndex + 1]);
  const scoreKind = tokens[scoreIndex + 1];
  const value = Number(tokens[scoreIndex + 2]);
  if (
    !Number.isFinite(depth) ||
    !Number.isFinite(value) ||
    (scoreKind !== 'cp' && scoreKind !== 'mate')
  ) {
    return undefined;
  }
  const pvIndex = tokens.indexOf('pv');
  return {
    evaluation: {
      score: scoreKind === 'cp' ? { kind: 'centipawn', value } : { kind: 'mate', moves: value },
      depth,
    },
    principalVariation: pvIndex < 0 ? [] : tokens.slice(pvIndex + 1),
    bounded: /\b(?:lowerbound|upperbound)\b/.test(line),
  };
}

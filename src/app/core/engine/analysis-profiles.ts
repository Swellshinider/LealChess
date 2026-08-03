export type AnalysisEngineId = 'stockfish-18-full' | 'stockfish-18-lite';

export type AnalysisWorkflow = 'game-review' | 'practice' | 'live-analysis' | 'explorer';

export interface AnalysisProfile {
  readonly engineId: AnalysisEngineId;
  readonly depth: number;
  readonly lines: number;
}

export interface AnalysisSettings {
  readonly profiles: Record<AnalysisWorkflow, AnalysisProfile>;
}

export interface AnalysisEngineCatalogEntry {
  readonly id: AnalysisEngineId;
  readonly name: string;
  readonly description: string;
  readonly approximateBytes: number;
  readonly scriptPath: string;
  readonly wasmPath: string;
}

export const ANALYSIS_DEPTH_RANGE = { min: 10, max: 24 } as const;
export const ANALYSIS_LINES_RANGE = { min: 1, max: 5 } as const;

export const ANALYSIS_ENGINE_CATALOG: readonly AnalysisEngineCatalogEntry[] = [
  {
    id: 'stockfish-18-full',
    name: 'Stockfish 18 Full',
    description: 'Maximum local playing strength for deeper study.',
    approximateBytes: 113_013_789,
    scriptPath: 'assets/stockfish/stockfish-18-single.js',
    wasmPath: 'assets/stockfish/stockfish-18-single.wasm',
  },
  {
    id: 'stockfish-18-lite',
    name: 'Stockfish 18 Lite',
    description: 'A compact engine for faster downloads and limited storage.',
    approximateBytes: 7_316_840,
    scriptPath: 'assets/stockfish/stockfish-18-lite-single.js',
    wasmPath: 'assets/stockfish/stockfish-18-lite-single.wasm',
  },
] as const;

export const ANALYSIS_WORKFLOWS: readonly AnalysisWorkflow[] = [
  'game-review',
  'practice',
  'live-analysis',
  'explorer',
];

export const ANALYSIS_WORKFLOW_LABELS: Record<AnalysisWorkflow, string> = {
  'game-review': 'Game review',
  practice: 'Practice',
  'live-analysis': 'Live analysis',
  explorer: 'Explorer',
};

export const DEFAULT_ANALYSIS_PROFILES: Record<AnalysisWorkflow, AnalysisProfile> = {
  'game-review': { engineId: 'stockfish-18-full', depth: 16, lines: 2 },
  practice: { engineId: 'stockfish-18-full', depth: 14, lines: 3 },
  'live-analysis': { engineId: 'stockfish-18-full', depth: 16, lines: 3 },
  explorer: { engineId: 'stockfish-18-full', depth: 14, lines: 3 },
};

export function normalizeAnalysisSettings(value: unknown): AnalysisSettings {
  const source = isRecord(value) && isRecord(value['profiles']) ? value['profiles'] : {};
  return {
    profiles: Object.fromEntries(
      ANALYSIS_WORKFLOWS.map((workflow) => [
        workflow,
        normalizeAnalysisProfile(source[workflow], DEFAULT_ANALYSIS_PROFILES[workflow]),
      ]),
    ) as Record<AnalysisWorkflow, AnalysisProfile>,
  };
}

export function normalizeAnalysisProfile(
  value: unknown,
  fallback: AnalysisProfile,
): AnalysisProfile {
  const source = isRecord(value) ? value : {};
  return {
    engineId: isAnalysisEngineId(source['engineId']) ? source['engineId'] : fallback.engineId,
    depth: boundedInteger(source['depth'], fallback.depth, ANALYSIS_DEPTH_RANGE),
    lines: boundedInteger(source['lines'], fallback.lines, ANALYSIS_LINES_RANGE),
  };
}

export function analysisProfileFingerprint(profile: AnalysisProfile): string {
  return `analysis-profile-v1:${profile.engineId}:d${profile.depth}:pv${profile.lines}`;
}

export function isAnalysisEngineId(value: unknown): value is AnalysisEngineId {
  return ANALYSIS_ENGINE_CATALOG.some((engine) => engine.id === value);
}

export function engineCatalogEntry(id: AnalysisEngineId): AnalysisEngineCatalogEntry {
  return ANALYSIS_ENGINE_CATALOG.find((engine) => engine.id === id)!;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  range: { readonly min: number; readonly max: number },
): number {
  return Number.isInteger(value) && Number(value) >= range.min && Number(value) <= range.max
    ? Number(value)
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

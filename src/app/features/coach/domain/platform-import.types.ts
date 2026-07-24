import type { ImportedGame, ImportedProfile, SpeedFilter } from './coach.types';

export interface PlatformFetchRequest {
  username: string;
  maxGames: number;
  speed: SpeedFilter;
}

export interface PlatformFetchResult {
  profile: ImportedProfile;
  games: ImportedGame[];
  discoveredCount: number;
  skippedCount: number;
  warning?: string;
}

export interface PlatformApi {
  fetchGames(request: PlatformFetchRequest): Promise<PlatformFetchResult>;
}

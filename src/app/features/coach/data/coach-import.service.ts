import { Injectable, computed, inject, signal } from '@angular/core';
import { calculateImportSummary } from '../analysis/import-summary';
import type {
  ChessPlatform,
  ImportedGame,
  ImportedProfile,
  ImportRequest,
  PlatformImportStatus,
} from '../domain/coach.types';
import type { PlatformApi, PlatformFetchRequest } from '../domain/platform-import.types';
import { ChessComApiService } from '../platforms/chess-com-api.service';
import { LichessApiService } from '../platforms/lichess-api.service';
import { CoachRepositoryService } from './coach-repository.service';

const IDLE_STATUS: Record<ChessPlatform, PlatformImportStatus> = {
  'chess-com': {
    platform: 'chess-com',
    state: 'idle',
    message: 'Add a username to import Chess.com games.',
    importedCount: 0,
  },
  lichess: {
    platform: 'lichess',
    state: 'idle',
    message: 'Add a username to import Lichess games.',
    importedCount: 0,
  },
};

@Injectable({ providedIn: 'root' })
export class CoachImportService {
  private readonly chessCom = inject(ChessComApiService);
  private readonly lichess = inject(LichessApiService);
  private readonly repository = inject(CoachRepositoryService);
  private readonly mutableProfiles = signal<ImportedProfile[]>([]);
  private readonly mutableGames = signal<ImportedGame[]>([]);
  private readonly mutableStatuses = signal<Record<ChessPlatform, PlatformImportStatus>>(
    structuredClone(IDLE_STATUS),
  );

  readonly profiles = this.mutableProfiles.asReadonly();
  readonly games = this.mutableGames.asReadonly();
  readonly statuses = this.mutableStatuses.asReadonly();
  readonly loading = computed(() =>
    Object.values(this.mutableStatuses()).some((status) => status.state === 'loading'),
  );
  readonly summary = computed(() =>
    calculateImportSummary(
      this.mutableGames(),
      Object.fromEntries(
        this.mutableProfiles().map((profile) => [profile.platform, profile.username]),
      ),
    ),
  );

  async initialize(): Promise<void> {
    const [profiles, games] = await Promise.all([
      this.repository.profiles(),
      this.repository.gamesForActiveProfiles(),
    ]);
    this.mutableProfiles.set(profiles);
    this.mutableGames.set(games);
  }

  async import(request: ImportRequest): Promise<void> {
    const jobs: Promise<void>[] = [];
    if (request.chessComUsername.trim()) {
      jobs.push(
        this.importPlatform('chess-com', this.chessCom, {
          username: request.chessComUsername,
          maxGames: request.maxGames,
          speed: request.speed,
        }),
      );
    }
    if (request.lichessUsername.trim()) {
      jobs.push(
        this.importPlatform('lichess', this.lichess, {
          username: request.lichessUsername,
          maxGames: request.maxGames,
          speed: request.speed,
        }),
      );
    }
    await Promise.all(jobs);
    await this.initialize();
  }

  private async importPlatform(
    platform: ChessPlatform,
    api: PlatformApi,
    request: PlatformFetchRequest,
  ): Promise<void> {
    this.updateStatus(platform, {
      platform,
      state: 'loading',
      message: `Finding recent ${platform === 'chess-com' ? 'Chess.com' : 'Lichess'} games…`,
      importedCount: 0,
    });
    try {
      const result = await api.fetchGames(request);
      await this.repository.saveSuccessfulImport(result.profile, result.games);
      this.updateStatus(platform, {
        platform,
        state: result.warning ? 'warning' : 'success',
        message:
          result.warning ??
          (result.games.length
            ? `Imported ${result.games.length} games. Ready to find learning moments.`
            : 'Profile found. No games matched these filters.'),
        importedCount: result.games.length,
      });
    } catch (error) {
      this.updateStatus(platform, {
        platform,
        state: 'error',
        message: error instanceof Error ? error.message : 'Import failed. Please retry.',
        importedCount: 0,
      });
    }
  }

  private updateStatus(platform: ChessPlatform, status: PlatformImportStatus): void {
    this.mutableStatuses.update((statuses) => ({ ...statuses, [platform]: status }));
  }
}

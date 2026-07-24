import { Injectable, computed, inject, signal } from '@angular/core';
import { calculateImportSummary } from '../analysis/import-summary';
import {
  analysisFingerprint,
  learnerColorForGame,
  learningPriorities,
} from '../analysis/analysis-rules';
import type {
  ChessPlatform,
  GameAnalysis,
  ImportedGame,
  ImportedProfile,
  ImportOutcomeCounts,
  ImportRequest,
  PlatformImportStatus,
} from '../domain/coach.types';
import type { PlatformApi, PlatformFetchRequest } from '../domain/platform-import.types';
import { ChessComApiService } from '../platforms/chess-com-api.service';
import { LichessApiService } from '../platforms/lichess-api.service';
import { PlatformImportError } from '../platforms/platform-errors';
import { CoachRepositoryService } from './coach-repository.service';

const EMPTY_COUNTS: ImportOutcomeCounts = {
  added: 0,
  duplicates: 0,
  unavailable: 0,
  skipped: 0,
};

const IDLE_STATUS: Record<ChessPlatform, PlatformImportStatus> = {
  'chess-com': {
    platform: 'chess-com',
    state: 'idle',
    message: 'Add a username to import Chess.com games.',
    counts: EMPTY_COUNTS,
    canRetry: false,
  },
  lichess: {
    platform: 'lichess',
    state: 'idle',
    message: 'Add a username to import Lichess games.',
    counts: EMPTY_COUNTS,
    canRetry: false,
  },
};

@Injectable({ providedIn: 'root' })
export class CoachImportService {
  private readonly chessCom = inject(ChessComApiService);
  private readonly lichess = inject(LichessApiService);
  private readonly repository = inject(CoachRepositoryService);
  private readonly mutableProfiles = signal<ImportedProfile[]>([]);
  private readonly mutableGames = signal<ImportedGame[]>([]);
  private readonly mutableAnalyses = signal<GameAnalysis[]>([]);
  private readonly mutableStatuses = signal<Record<ChessPlatform, PlatformImportStatus>>(
    structuredClone(IDLE_STATUS),
  );
  private readonly lastRequests = new Map<ChessPlatform, PlatformFetchRequest>();

  readonly profiles = this.mutableProfiles.asReadonly();
  readonly games = this.mutableGames.asReadonly();
  readonly analyses = this.mutableAnalyses.asReadonly();
  readonly completedAnalyses = computed(() =>
    this.mutableAnalyses().filter((analysis) => analysis.status === 'complete'),
  );
  readonly statuses = this.mutableStatuses.asReadonly();
  readonly loading = computed(() =>
    Object.values(this.mutableStatuses()).some((status) => status.state === 'loading'),
  );
  readonly hasFailures = computed(() =>
    Object.values(this.mutableStatuses()).some((status) => status.state === 'error'),
  );
  readonly summary = computed(() =>
    calculateImportSummary(
      this.mutableGames(),
      Object.fromEntries(
        this.mutableProfiles().map((profile) => [profile.platform, profile.username]),
      ),
    ),
  );
  readonly priorities = computed(() => learningPriorities(this.completedAnalyses()));

  async initialize(): Promise<void> {
    const [profiles, games, cachedAnalyses] = await Promise.all([
      this.repository.profiles(),
      this.repository.gamesForActiveProfiles(),
      this.repository.analyses(),
    ]);
    this.mutableProfiles.set(profiles);
    this.mutableGames.set(games);
    const gamesByKey = new Map(games.map((game) => [game.key, game]));
    const currentAnalyses = await Promise.all(
      cachedAnalyses.map(async (analysis) => {
        const game = gamesByKey.get(analysis.importedGameKey);
        const color = game ? learnerColorForGame(game, profiles) : undefined;
        if (!game || !color) return null;
        return (await analysisFingerprint(game, color)) === analysis.sourceFingerprint
          ? analysis
          : null;
      }),
    );
    this.mutableAnalyses.set(
      currentAnalyses.filter((analysis): analysis is GameAnalysis => analysis !== null),
    );
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

  async retry(platform: ChessPlatform): Promise<void> {
    const request = this.lastRequests.get(platform);
    if (!request || this.mutableStatuses()[platform].state === 'loading') return;
    await this.importPlatform(
      platform,
      platform === 'chess-com' ? this.chessCom : this.lichess,
      request,
    );
    await this.initialize();
  }

  private async importPlatform(
    platform: ChessPlatform,
    api: PlatformApi,
    request: PlatformFetchRequest,
  ): Promise<void> {
    this.lastRequests.set(platform, request);
    this.updateStatus(platform, {
      platform,
      state: 'loading',
      message: `Finding recent ${platform === 'chess-com' ? 'Chess.com' : 'Lichess'} games…`,
      counts: { ...EMPTY_COUNTS },
      canRetry: false,
    });
    try {
      const result = await api.fetchGames(request);
      const saved = await this.repository.saveSuccessfulImport(result.profile, result.games);
      const counts: ImportOutcomeCounts = {
        added: saved.addedCount,
        duplicates: saved.duplicateCount,
        unavailable: result.games.filter((game) => game.parseStatus !== 'ready').length,
        skipped: result.skippedCount,
      };
      this.updateStatus(platform, {
        platform,
        state: result.warning || counts.unavailable || counts.skipped ? 'warning' : 'success',
        message: importMessage(counts, result.warning),
        counts,
        canRetry: false,
      });
    } catch (error) {
      const failure =
        error instanceof PlatformImportError
          ? error
          : new PlatformImportError(
              'invalid-response',
              'Import failed.',
              'Retry the import. Your saved games have not changed.',
              true,
            );
      this.updateStatus(platform, {
        platform,
        state: 'error',
        message: failure.message,
        counts: { ...EMPTY_COUNTS },
        recovery: failure.recovery,
        canRetry: failure.retryable,
      });
    }
  }

  private updateStatus(platform: ChessPlatform, status: PlatformImportStatus): void {
    this.mutableStatuses.update((statuses) => ({ ...statuses, [platform]: status }));
  }
}

function importMessage(counts: ImportOutcomeCounts, warning?: string): string {
  const messages: string[] = [];
  if (counts.added) {
    messages.push(`Added ${gameCount(counts.added)}.`);
  } else if (counts.duplicates) {
    messages.push('No new games were added.');
  } else {
    messages.push('Profile found, but no games matched these filters.');
  }
  if (counts.duplicates) {
    messages.push(`${gameCount(counts.duplicates)} already in your ledger.`);
  }
  if (counts.unavailable) {
    messages.push(`${gameCount(counts.unavailable)} cannot be replayed yet.`);
  }
  if (counts.skipped) {
    messages.push(`${gameCount(counts.skipped)} could not be identified and was skipped.`);
  }
  if (warning) messages.push(warning);
  return messages.join(' ');
}

function gameCount(count: number): string {
  return `${count} ${count === 1 ? 'game' : 'games'}`;
}

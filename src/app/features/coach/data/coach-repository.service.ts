import { Injectable, inject } from '@angular/core';
import { LealChessDatabaseService } from '../../../core/persistence/leal-chess-database.service';
import type {
  ChessPlatform,
  GameAnalysis,
  ImportedGame,
  ImportedProfile,
} from '../domain/coach.types';

@Injectable({ providedIn: 'root' })
export class CoachRepositoryService {
  private readonly database = inject(LealChessDatabaseService);

  async profiles(): Promise<ImportedProfile[]> {
    return (await this.database.open()).getAll('coachProfiles');
  }

  async gamesForActiveProfiles(): Promise<ImportedGame[]> {
    const database = await this.database.open();
    const profiles = await database.getAll('coachProfiles');
    const collections = await Promise.all(
      profiles.map((profile) =>
        database.getAllFromIndex(
          'importedGames',
          'by-profile-key',
          profileKey(profile.platform, profile.username),
        ),
      ),
    );
    const unique = new Map(collections.flat().map((game) => [game.key, game]));
    return [...unique.values()].sort((left, right) => right.endTime.localeCompare(left.endTime));
  }

  async game(platform: ChessPlatform, gameId: string): Promise<ImportedGame | undefined> {
    return (await this.database.open()).get('importedGames', `${platform}:${gameId}`);
  }

  async analysis(gameKey: string): Promise<GameAnalysis | undefined> {
    return (await this.database.open()).get('gameAnalyses', gameKey);
  }

  async analyses(): Promise<GameAnalysis[]> {
    return (await this.database.open()).getAll('gameAnalyses');
  }

  async saveAnalysis(analysis: GameAnalysis): Promise<void> {
    await (await this.database.open()).put('gameAnalyses', analysis);
  }

  async saveSuccessfulImport(profile: ImportedProfile, games: ImportedGame[]): Promise<void> {
    const database = await this.database.open();
    const transaction = database.transaction(['coachProfiles', 'importedGames'], 'readwrite');
    const store = transaction.objectStore('importedGames');
    for (const game of games) {
      const existing = await store.get(game.key);
      await store.put({
        ...game,
        firstImportedAt: existing?.firstImportedAt ?? game.firstImportedAt,
        profileKeys: [...new Set([...(existing?.profileKeys ?? []), ...game.profileKeys])],
      });
    }
    await transaction.objectStore('coachProfiles').put(profile);
    await transaction.done;
  }
}

export function profileKey(platform: ChessPlatform, username: string): string {
  return `${platform}:${username.trim().toLowerCase()}`;
}

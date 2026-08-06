import { Injectable, inject } from '@angular/core';
import {
  LealChessDatabaseService,
  type LealChessStoreRecords,
} from '../../../core/persistence/leal-chess-database.service';
import type {
  ChessPlatform,
  GameAnalysis,
  GameSource,
  ImportedGame,
  ImportedProfile,
} from '../domain/coach.types';
import type { OpeningInfo } from '../../../core/openings/opening.types';

interface CoachRecords extends LealChessStoreRecords {
  coachProfiles: ImportedProfile;
  importedGames: ImportedGame;
  gameAnalyses: GameAnalysis;
}

export interface ImportSaveResult {
  addedCount: number;
  duplicateCount: number;
}

@Injectable({ providedIn: 'root' })
export class CoachRepositoryService {
  private readonly database = inject(LealChessDatabaseService);

  async profiles(): Promise<ImportedProfile[]> {
    return (await this.database.open<CoachRecords>()).getAll('coachProfiles');
  }

  async gamesForActiveProfiles(): Promise<ImportedGame[]> {
    const database = await this.database.open<CoachRecords>();
    const [profiles, games] = await Promise.all([
      database.getAll('coachProfiles'),
      database.getAll('importedGames'),
    ]);
    const activeProfileKeys = new Set(
      profiles.map((profile) => profileKey(profile.platform, profile.username)),
    );
    return games
      .filter(
        (game) =>
          game.platform === 'local' || game.profileKeys.some((key) => activeProfileKeys.has(key)),
      )
      .sort((left, right) => right.endTime.localeCompare(left.endTime));
  }

  async game(platform: GameSource, gameId: string): Promise<ImportedGame | undefined> {
    return (await this.database.open<CoachRecords>()).get('importedGames', `${platform}:${gameId}`);
  }

  async analysis(gameKey: string): Promise<GameAnalysis | undefined> {
    return (await this.database.open<CoachRecords>()).get('gameAnalyses', gameKey);
  }

  async analyses(): Promise<GameAnalysis[]> {
    return (await this.database.open<CoachRecords>()).getAll('gameAnalyses');
  }

  async saveAnalysis(analysis: GameAnalysis): Promise<void> {
    await (await this.database.open<CoachRecords>()).put('gameAnalyses', analysis);
  }

  async saveLocalGame(game: ImportedGame): Promise<void> {
    if (game.platform !== 'local') {
      throw new Error('Only local games can be saved through this operation.');
    }
    const database = await this.database.open<CoachRecords>();
    const existing = await database.get('importedGames', game.key);
    await database.put('importedGames', {
      ...game,
      firstImportedAt: existing?.firstImportedAt ?? game.firstImportedAt,
      ...openingMerge(existing, game),
    });
  }

  async saveOpeningIfMissing(gameKey: string, opening: OpeningInfo): Promise<void> {
    const database = await this.database.open<CoachRecords>();
    const transaction = database.transaction('importedGames', 'readwrite');
    const store = transaction.objectStore('importedGames');
    const existing = await store.get(gameKey);
    if (existing && !hasOpening(existing.opening)) {
      await store.put({ ...existing, opening });
    }
    await transaction.done;
  }

  async deleteGame(game: ImportedGame): Promise<void> {
    const database = await this.database.open<CoachRecords>();
    const transaction = database.transaction(
      ['state', 'importedGames', 'gameAnalyses', 'reviewAnalysisSessions'],
      'readwrite',
    );
    await Promise.all([
      transaction.objectStore('importedGames').delete(game.key),
      transaction.objectStore('gameAnalyses').delete(game.key),
      transaction.objectStore('reviewAnalysisSessions').delete(game.key),
    ]);

    if (game.platform === 'local') {
      const activeGame = await transaction.objectStore('state').get('active-game');
      if (activeGame?.key === 'active-game' && activeGame.value.gameId === game.platformGameId) {
        await transaction.objectStore('state').delete('active-game');
      }
    }
    await transaction.done;
  }

  async saveSuccessfulImport(
    profile: ImportedProfile,
    games: ImportedGame[],
  ): Promise<ImportSaveResult> {
    const database = await this.database.open<CoachRecords>();
    const transaction = database.transaction(['coachProfiles', 'importedGames'], 'readwrite');
    const store = transaction.objectStore('importedGames');
    let addedCount = 0;
    let duplicateCount = 0;
    for (const game of games) {
      const existing = await store.get(game.key);
      if (existing) {
        duplicateCount += 1;
      } else {
        addedCount += 1;
      }
      await store.put({
        ...game,
        firstImportedAt: existing?.firstImportedAt ?? game.firstImportedAt,
        profileKeys: [...new Set([...(existing?.profileKeys ?? []), ...game.profileKeys])],
        ...openingMerge(existing, game),
      });
    }
    await transaction.objectStore('coachProfiles').put(profile);
    await transaction.done;
    return { addedCount, duplicateCount };
  }
}

export function profileKey(platform: ChessPlatform, username: string): string {
  return `${platform}:${username.trim().toLowerCase()}`;
}

function openingMerge(
  existing: ImportedGame | undefined,
  incoming: ImportedGame,
): Pick<ImportedGame, 'opening'> | Record<string, never> {
  if (hasOpening(incoming.opening)) return { opening: incoming.opening };
  return hasOpening(existing?.opening) ? { opening: existing.opening } : {};
}

function hasOpening(opening: OpeningInfo | undefined): opening is OpeningInfo {
  return Boolean(opening?.name.trim());
}

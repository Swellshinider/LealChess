import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PlatformFetchRequest, PlatformFetchResult } from '../domain/platform-import.types';
import { normalizeChessComGame, type ChessComGameResponse } from './chess-com-normalizer';
import { platformErrorMessage } from './platform-errors';

interface ChessComProfileResponse {
  username?: string;
  name?: string;
  url?: string;
  avatar?: string;
}

@Injectable({ providedIn: 'root' })
export class ChessComApiService {
  private readonly http = inject(HttpClient);

  async fetchGames(request: PlatformFetchRequest): Promise<PlatformFetchResult> {
    const username = request.username.trim();
    const profileKey = `chess-com:${username.toLowerCase()}`;
    let profileResponse: ChessComProfileResponse;
    try {
      profileResponse = await firstValueFrom(
        this.http.get<ChessComProfileResponse>(
          `https://api.chess.com/pub/player/${encodeURIComponent(username)}`,
        ),
      );
    } catch (error) {
      throw new Error(platformErrorMessage(error, 'chess-com'));
    }

    try {
      const archiveResponse = await firstValueFrom(
        this.http.get<{ archives?: string[] }>(
          `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
        ),
      );
      const games: ChessComGameResponse[] = [];
      let scannedNonEmpty = 0;
      for (const archive of [...(archiveResponse.archives ?? [])].reverse()) {
        if (
          games.length >= request.maxGames ||
          (request.speed !== 'any' && scannedNonEmpty >= 12)
        ) {
          break;
        }
        const response = await firstValueFrom(
          this.http.get<{ games?: ChessComGameResponse[] }>(archive),
        );
        const newest = [...(response.games ?? [])].sort(
          (left, right) => (right.end_time ?? 0) - (left.end_time ?? 0),
        );
        if (newest.length === 0) continue;
        scannedNonEmpty += 1;
        games.push(
          ...newest
            .filter((game) => matchesChessComSpeed(game.time_class, request.speed))
            .slice(0, request.maxGames - games.length),
        );
      }
      const now = new Date().toISOString();
      const warning =
        games.length < request.maxGames && request.speed !== 'any' && scannedNonEmpty >= 12
          ? `Found ${games.length} matching games in the 12 newest non-empty archives.`
          : undefined;
      return {
        profile: {
          platform: 'chess-com',
          username: profileResponse.username ?? username,
          displayName: profileResponse.name ?? profileResponse.username ?? username,
          profileUrl: profileResponse.url ?? `https://www.chess.com/member/${username}`,
          ...(profileResponse.avatar ? { avatarUrl: profileResponse.avatar } : {}),
          updatedAt: now,
        },
        games: games.map((game) => normalizeChessComGame(game, profileKey, now)),
        ...(warning ? { warning } : {}),
      };
    } catch (error) {
      throw new Error(platformErrorMessage(error, 'chess-com', true));
    }
  }
}

function matchesChessComSpeed(
  speed: string | undefined,
  filter: PlatformFetchRequest['speed'],
): boolean {
  if (filter === 'any') return true;
  if (filter === 'classical-daily') return speed === 'daily';
  return speed === filter;
}

import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PlatformFetchRequest, PlatformFetchResult } from '../domain/platform-import.types';
import { normalizeLichessGame, type LichessGameResponse } from './lichess-normalizer';
import { platformErrorMessage } from './platform-errors';

interface LichessProfileResponse {
  username?: string;
  title?: string;
  profile?: { firstName?: string; lastName?: string };
}

@Injectable({ providedIn: 'root' })
export class LichessApiService {
  private readonly http = inject(HttpClient);

  async fetchGames(request: PlatformFetchRequest): Promise<PlatformFetchResult> {
    const username = request.username.trim();
    const encoded = encodeURIComponent(username);
    let profileResponse: LichessProfileResponse;
    try {
      profileResponse = await firstValueFrom(
        this.http.get<LichessProfileResponse>(`https://lichess.org/api/user/${encoded}`),
      );
    } catch (error) {
      throw new Error(platformErrorMessage(error, 'lichess'));
    }

    try {
      let params = new HttpParams()
        .set('max', request.maxGames)
        .set('moves', true)
        .set('tags', true)
        .set('opening', true)
        .set('pgnInJson', true);
      const perfType = lichessPerfType(request.speed);
      if (perfType) params = params.set('perfType', perfType);
      const response = await firstValueFrom(
        this.http.get(`https://lichess.org/api/games/user/${encoded}`, {
          headers: new HttpHeaders({ Accept: 'application/x-ndjson' }),
          params,
          responseType: 'text',
        }),
      );
      const sources = response
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as LichessGameResponse);
      const now = new Date().toISOString();
      const canonicalUsername = profileResponse.username ?? username;
      return {
        profile: {
          platform: 'lichess',
          username: canonicalUsername,
          displayName: displayName(profileResponse) || canonicalUsername,
          profileUrl: `https://lichess.org/@/${canonicalUsername}`,
          updatedAt: now,
        },
        games: sources
          .slice(0, request.maxGames)
          .map((game) => normalizeLichessGame(game, `lichess:${username.toLowerCase()}`, now)),
      };
    } catch (error) {
      throw new Error(platformErrorMessage(error, 'lichess', true));
    }
  }
}

function lichessPerfType(speed: PlatformFetchRequest['speed']): string | undefined {
  if (speed === 'any') return undefined;
  if (speed === 'classical-daily') return 'classical,correspondence';
  return speed;
}

function displayName(profile: LichessProfileResponse): string {
  const realName = [profile.profile?.firstName, profile.profile?.lastName]
    .filter(Boolean)
    .join(' ');
  return [profile.title, realName].filter(Boolean).join(' ');
}

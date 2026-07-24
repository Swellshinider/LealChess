import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChessComApiService } from './chess-com-api.service';
import { LichessApiService } from './lichess-api.service';

const request = { username: 'Learner', maxGames: 20, speed: 'any' as const };

describe('platform API services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ChessComApiService,
        LichessApiService,
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('classifies an invalid Chess.com profile', async () => {
    const service = TestBed.inject(ChessComApiService);
    const result = service.fetchGames(request);
    http
      .expectOne('https://api.chess.com/pub/player/Learner')
      .flush('Missing', { status: 404, statusText: 'Not Found' });

    await expect(result).rejects.toMatchObject({
      code: 'profile-not-found',
      retryable: false,
    });
  });

  it('classifies a rate-limited export without invalidating the profile', async () => {
    const service = TestBed.inject(ChessComApiService);
    const result = service.fetchGames(request);
    http.expectOne('https://api.chess.com/pub/player/Learner').flush({ username: 'Learner' });
    await Promise.resolve();
    http
      .expectOne('https://api.chess.com/pub/player/Learner/games/archives')
      .flush('Slow down', { status: 429, statusText: 'Too Many Requests' });

    await expect(result).rejects.toMatchObject({
      code: 'rate-limited',
      retryable: true,
    });
  });

  it('keeps an identified unavailable Chess.com game and skips unstable records', async () => {
    const service = TestBed.inject(ChessComApiService);
    const result = service.fetchGames(request);
    http.expectOne('https://api.chess.com/pub/player/Learner').flush({ username: 'Learner' });
    await Promise.resolve();
    http
      .expectOne('https://api.chess.com/pub/player/Learner/games/archives')
      .flush({ archives: ['https://api.chess.com/games/archive'] });
    await Promise.resolve();
    http.expectOne('https://api.chess.com/games/archive').flush({
      games: [{ uuid: 'private-game' }, { white: { username: 'Learner' } }],
    });

    await expect(result).resolves.toMatchObject({
      discoveredCount: 2,
      skippedCount: 1,
      games: [{ key: 'chess-com:private-game', parseStatus: 'unavailable' }],
    });
  });

  it('retains malformed Lichess PGNs and skips unreadable NDJSON lines', async () => {
    const service = TestBed.inject(LichessApiService);
    const result = service.fetchGames(request);
    http.expectOne('https://lichess.org/api/user/Learner').flush({ username: 'Learner' });
    await Promise.resolve();
    const exportRequest = http.expectOne(
      (candidate) => candidate.url === 'https://lichess.org/api/games/user/Learner',
    );
    exportRequest.flush(
      `${JSON.stringify({ id: 'bad-pgn', pgn: '1. ThisIsNotAMove' })}\nnot-json\n`,
    );

    await expect(result).resolves.toMatchObject({
      discoveredCount: 2,
      skippedCount: 1,
      games: [{ key: 'lichess:bad-pgn', parseStatus: 'invalid-pgn' }],
    });
  });

  it('classifies private Lichess exports as restricted access', async () => {
    const service = TestBed.inject(LichessApiService);
    const result = service.fetchGames(request);
    http.expectOne('https://lichess.org/api/user/Learner').flush({ username: 'Learner' });
    await Promise.resolve();
    http
      .expectOne((candidate) => candidate.url === 'https://lichess.org/api/games/user/Learner')
      .flush('Private', { status: 403, statusText: 'Forbidden' });

    await expect(result).rejects.toMatchObject({
      code: 'access-restricted',
      retryable: true,
    });
  });
});

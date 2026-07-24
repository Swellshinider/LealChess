import { HttpErrorResponse } from '@angular/common/http';
import type { ChessPlatform } from '../domain/coach.types';

export type PlatformImportErrorCode =
  | 'profile-not-found'
  | 'access-restricted'
  | 'rate-limited'
  | 'offline'
  | 'service-unavailable'
  | 'invalid-response';

export class PlatformImportError extends Error {
  constructor(
    readonly code: PlatformImportErrorCode,
    message: string,
    readonly recovery: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'PlatformImportError';
  }
}

export function platformImportError(
  error: unknown,
  platform: ChessPlatform,
  profileWasValid = false,
): PlatformImportError {
  const label = platform === 'chess-com' ? 'Chess.com' : 'Lichess';
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404 && !profileWasValid) {
      return new PlatformImportError(
        'profile-not-found',
        `We could not find that ${label} username.`,
        'Check the spelling, update the username, and import again.',
        false,
      );
    }
    if (error.status === 404 && profileWasValid) {
      return new PlatformImportError(
        'service-unavailable',
        `${label} could not provide this game export.`,
        'The games may be private or deleted. Check the profile, then retry the import.',
        true,
      );
    }
    if (error.status === 401 || error.status === 403) {
      return new PlatformImportError(
        'access-restricted',
        `${label} is not allowing access to these games.`,
        'Make the games public or use another profile, then retry the import.',
        true,
      );
    }
    if (error.status === 429) {
      return new PlatformImportError(
        'rate-limited',
        `${label} is limiting requests right now.`,
        'Wait a moment, then retry this platform.',
        true,
      );
    }
    if (error.status === 0) {
      return new PlatformImportError(
        'offline',
        `Could not reach ${label}.`,
        'Check your connection and browser privacy settings, then retry.',
        true,
      );
    }
    if (error.status >= 500) {
      return new PlatformImportError(
        'service-unavailable',
        `${label} is temporarily unavailable.`,
        'Your saved games are safe. Retry this platform in a moment.',
        true,
      );
    }
  }
  return new PlatformImportError(
    'invalid-response',
    `The ${label} response could not be read.`,
    'Retry the import. If it fails again, check whether the profile games are public.',
    true,
  );
}

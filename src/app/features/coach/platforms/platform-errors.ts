import { HttpErrorResponse } from '@angular/common/http';
import type { ChessPlatform } from '../domain/coach.types';

export function platformErrorMessage(
  error: unknown,
  platform: ChessPlatform,
  profileWasValid = false,
): string {
  const label = platform === 'chess-com' ? 'Chess.com' : 'Lichess';
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404 && !profileWasValid) {
      return `We could not find that ${label} username. Check the spelling and try again.`;
    }
    if (error.status === 404 && profileWasValid) {
      return `${label} game export is temporarily unavailable. Your profile is valid, so please retry soon.`;
    }
    if (error.status === 429) {
      return `${label} is limiting requests right now. Wait a moment, then retry.`;
    }
    if (error.status === 0) {
      return `Could not reach ${label}. Check your connection or browser privacy settings and retry.`;
    }
    if (error.status >= 500) {
      return `${label} is temporarily unavailable. Your saved games are safe; please retry soon.`;
    }
  }
  return `The ${label} response could not be read. Please retry in a moment.`;
}

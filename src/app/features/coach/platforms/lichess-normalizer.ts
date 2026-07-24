import type { ImportedGame } from '../domain/coach.types';
import { parseImportedPgn } from '../parsing/pgn-parser';

interface LichessPlayer {
  user?: { name?: string };
  rating?: number;
}

export interface LichessGameResponse {
  id?: string;
  url?: string;
  pgn?: string;
  variant?: string;
  speed?: string;
  rated?: boolean;
  createdAt?: number;
  lastMoveAt?: number;
  status?: string;
  winner?: 'white' | 'black';
  clock?: { initial?: number; increment?: number };
  players?: { white?: LichessPlayer; black?: LichessPlayer };
  opening?: { eco?: string; name?: string };
}

export function normalizeLichessGame(
  source: LichessGameResponse,
  profileKey: string,
  importedAt: string,
): ImportedGame | null {
  const gameId = source.id;
  if (!gameId) return null;
  const pgn = source.pgn ?? '';
  const variant = source.variant ?? 'standard';
  const parsed = pgn.trim()
    ? parseImportedPgn(pgn, variant)
    : {
        status: 'unavailable' as const,
        moves: [],
        error:
          'Game moves are unavailable. The game may be private or deleted; make it public and import again.',
      };
  const headers = pgnHeaders(pgn);
  return {
    key: `lichess:${gameId}`,
    platform: 'lichess',
    platformGameId: gameId,
    platformUrl: source.url ?? `https://lichess.org/${gameId}`,
    pgn,
    variant,
    white: player(source.players?.white, headers['White']),
    black: player(source.players?.black, headers['Black']),
    result: headers['Result'] ?? resultFromLichess(source),
    speed: source.speed ?? 'unknown',
    timeControl: headers['TimeControl'] ?? clockLabel(source.clock),
    rated: source.rated ?? false,
    endTime: new Date(source.lastMoveAt ?? source.createdAt ?? 0).toISOString(),
    ...(source.opening?.name || headers['Opening']
      ? {
          opening: {
            name: source.opening?.name ?? headers['Opening'] ?? 'Unknown',
            eco: source.opening?.eco ?? headers['ECO'],
          },
        }
      : {}),
    moves: parsed.moves,
    parseStatus: parsed.status,
    ...(parsed.error ? { parseError: parsed.error } : {}),
    profileKeys: [profileKey],
    firstImportedAt: importedAt,
    lastImportedAt: importedAt,
  };
}

function player(source: LichessPlayer | undefined, header: string | undefined) {
  return {
    username: source?.user?.name ?? header ?? 'Anonymous',
    ...(source?.rating === undefined ? {} : { rating: source.rating }),
  };
}

function pgnHeaders(pgn: string): Record<string, string> {
  return Object.fromEntries(
    [...pgn.matchAll(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/gm)].map((match) => [
      match[1] ?? '',
      match[2] ?? '',
    ]),
  );
}

function resultFromLichess(source: LichessGameResponse): string {
  return source.winner === 'white' ? '1-0' : source.winner === 'black' ? '0-1' : '1/2-1/2';
}

function clockLabel(clock: LichessGameResponse['clock']): string {
  if (!clock?.initial) return 'Unknown';
  return `${Math.round(clock.initial / 60)}+${clock.increment ?? 0}`;
}

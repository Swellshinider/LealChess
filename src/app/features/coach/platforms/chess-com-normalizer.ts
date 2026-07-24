import type { ImportedGame } from '../domain/coach.types';
import { parseImportedPgn } from '../parsing/pgn-parser';

export interface ChessComGameResponse {
  url?: string;
  uuid?: string;
  pgn?: string;
  time_control?: string;
  end_time?: number;
  rated?: boolean;
  time_class?: string;
  rules?: string;
  eco?: string;
  white?: { username?: string; rating?: number; result?: string };
  black?: { username?: string; rating?: number; result?: string };
}

export function normalizeChessComGame(
  source: ChessComGameResponse,
  profileKey: string,
  importedAt: string,
): ImportedGame {
  const url = source.url ?? '';
  const urlId = /\/game\/(?:live|daily)\/(\d+)/.exec(url)?.[1];
  const gameId = urlId ?? source.uuid ?? crypto.randomUUID();
  const pgn = source.pgn ?? '';
  const variant = source.rules ?? 'standard';
  const parsed = parseImportedPgn(pgn, variant);
  const headers = pgnHeaders(pgn);
  const openingName = headers['Opening'] ?? openingNameFromUrl(headers['ECOUrl'] ?? source.eco);
  return {
    key: `chess-com:${gameId}`,
    platform: 'chess-com',
    platformGameId: gameId,
    platformUrl: url,
    pgn,
    variant,
    white: {
      username: source.white?.username ?? headers['White'] ?? 'Unknown',
      ...(source.white?.rating === undefined ? {} : { rating: source.white.rating }),
      ...(source.white?.result ? { result: source.white.result } : {}),
    },
    black: {
      username: source.black?.username ?? headers['Black'] ?? 'Unknown',
      ...(source.black?.rating === undefined ? {} : { rating: source.black.rating }),
      ...(source.black?.result ? { result: source.black.result } : {}),
    },
    result: headers['Result'] ?? resultFromChessCom(source),
    speed: source.time_class ?? 'unknown',
    timeControl: source.time_control ?? headers['TimeControl'] ?? 'Unknown',
    rated: source.rated ?? false,
    endTime: new Date((source.end_time ?? 0) * 1000).toISOString(),
    ...(openingName ? { opening: { name: openingName, eco: headers['ECO'] } } : {}),
    moves: parsed.moves,
    parseStatus: parsed.status,
    ...(parsed.error ? { parseError: parsed.error } : {}),
    profileKeys: [profileKey],
    firstImportedAt: importedAt,
    lastImportedAt: importedAt,
  };
}

function openingNameFromUrl(value: string | undefined): string | undefined {
  const slug = value?.split('/').filter(Boolean).at(-1);
  return slug ? decodeURIComponent(slug).replaceAll('-', ' ') : undefined;
}

function pgnHeaders(pgn: string): Record<string, string> {
  return Object.fromEntries(
    [...pgn.matchAll(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/gm)].map((match) => [
      match[1] ?? '',
      match[2] ?? '',
    ]),
  );
}

function resultFromChessCom(source: ChessComGameResponse): string {
  if (source.white?.result === 'win') return '1-0';
  if (source.black?.result === 'win') return '0-1';
  return '1/2-1/2';
}

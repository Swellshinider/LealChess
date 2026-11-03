import { Chess } from 'chess.js';
import type { Puzzle } from './puzzle.types';

type RecordValue = Record<string, unknown>;

export function normalizeLichessDaily(value: unknown): Puzzle {
  const root = record(value, 'Lichess response');
  const puzzle = record(root['puzzle'], 'Lichess puzzle');
  const id = string(puzzle['id'], 'puzzle id');
  const fen = string(puzzle['fen'], 'starting FEN');
  const solution = stringArray(puzzle['solution'], 'solution');
  const normalizedFen = new Chess(fen).fen();
  validateLine(normalizedFen, solution);
  return {
    source: 'lichess',
    key: id,
    fen: normalizedFen,
    solution,
    externalUrl: `https://lichess.org/training/${encodeURIComponent(id)}`,
    rating: optionalInteger(puzzle['rating']),
    themes: optionalStringArray(puzzle['themes']),
    openings: [],
  };
}

export function normalizeChessComDaily(value: unknown): Puzzle {
  const root = record(value, 'Chess.com response');
  const fen = string(root['fen'], 'starting FEN');
  const url = safeHttpUrl(string(root['url'], 'puzzle URL'), 'chess.com');
  const pgn = string(root['pgn'], 'solution PGN');
  const solution = pgnMainlineToUci(fen, pgn);
  if (solution.length === 0) throw new Error('Chess.com solution is empty.');
  return {
    source: 'chess-com',
    key: url.pathname.split('/').filter(Boolean).at(-1) ?? `${root['publish_time'] ?? 'daily'}`,
    fen: new Chess(fen).fen(),
    solution,
    externalUrl: url.toString(),
    title: typeof root['title'] === 'string' ? root['title'] : 'Chess.com daily puzzle',
    date:
      typeof root['publish_time'] === 'number'
        ? new Date(root['publish_time'] * 1000).toISOString().slice(0, 10)
        : undefined,
    themes: [],
    openings: [],
  };
}

export function pgnMainlineToUci(fen: string, pgn: string): string[] {
  const parsed = new Chess();
  const withFen = /\[FEN\s+"/.test(pgn)
    ? pgn
    : `[SetUp "1"]\n[FEN "${fen.replaceAll('"', '')}"]\n\n${pgn}`;
  parsed.loadPgn(withFen);
  const replay = new Chess(fen);
  return parsed.history().map((san) => {
    const move = replay.move(san);
    return `${move.from}${move.to}${move.promotion ?? ''}`;
  });
}

export function validateLine(fen: string, solution: readonly string[]): void {
  const chess = new Chess(fen);
  if (solution.length === 0) throw new Error('Puzzle solution is empty.');
  for (const uci of solution) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error(`Invalid UCI move: ${uci}`);
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      throw new Error(`Illegal puzzle move: ${uci}`);
    }
  }
}

function record(value: unknown, label: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${label} is invalid.`);
  return value as RecordValue;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function optionalInteger(value: unknown): number | undefined {
  return Number.isInteger(value) ? (value as number) : undefined;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    throw new Error(`${label} is invalid.`);
  return value;
}

function optionalStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function safeHttpUrl(value: string, requiredHost: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !(url.hostname === requiredHost || url.hostname.endsWith(`.${requiredHost}`))
  ) {
    throw new Error('Puzzle URL is invalid.');
  }
  return url;
}

import { Chess } from 'chess.js';
import type { ImportedMove, PgnParseResult } from '../domain/coach.types';

const STANDARD_VARIANTS = new Set(['standard', 'chess', 'from position']);

export function parseImportedPgn(pgn: string, variant = 'standard'): PgnParseResult {
  if (!STANDARD_VARIANTS.has(variant.trim().toLowerCase())) {
    return {
      status: 'unsupported-variant',
      moves: [],
      error: `Replay is unavailable for the ${variant} variant.`,
    };
  }

  try {
    const chess = new Chess();
    chess.loadPgn(pgn, { strict: false });
    const moves: ImportedMove[] = chess.history({ verbose: true }).map((move, index) => ({
      ply: index + 1,
      color: move.color === 'w' ? 'white' : 'black',
      san: move.san,
      from: move.from,
      to: move.to,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      fenBefore: move.before,
      fenAfter: move.after,
    }));
    return { status: 'ready', moves };
  } catch (error) {
    return {
      status: 'invalid-pgn',
      moves: [],
      error:
        error instanceof Error ? `Replay unavailable: ${error.message}` : 'Replay unavailable.',
    };
  }
}

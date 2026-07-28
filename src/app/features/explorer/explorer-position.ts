import { Chess, SQUARES, validateFen, type Color, type Piece, type Square } from 'chess.js';
import { STARTING_FEN, type MoveInput } from '../../core/game/game.types';
import type { ExplorerPgnResult, ExplorerSetupState } from './explorer.types';

export function parseExplorerFen(fen: string): { ok: boolean; fen?: string; error?: string } {
  const normalized = fen.trim().replace(/\s+/g, ' ');
  const validation = validateFen(normalized);
  if (!validation.ok) return { ok: false, error: validation.error };
  const safetyError = analyzablePositionError(normalized);
  return safetyError ? { ok: false, error: safetyError } : { ok: true, fen: normalized };
}

export function parseExplorerPgn(pgn: string): ExplorerPgnResult {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn.trim(), { strict: false });
    const headers = chess.getHeaders();
    const variant = (headers['Variant'] ?? 'standard').toLowerCase();
    if (!['standard', 'chess', 'from position'].includes(variant)) {
      return { ok: false, error: `Explorer does not support the ${headers['Variant']} variant.` };
    }
    const history = chess.history({ verbose: true });
    const rootFen = history[0]?.before ?? headers['FEN'] ?? STARTING_FEN;
    const rootValidation = parseExplorerFen(rootFen);
    if (!rootValidation.ok) return rootValidation;
    return {
      ok: true,
      rootFen: rootValidation.fen,
      moves: history.map((move) => ({
        move: {
          from: move.from,
          to: move.to,
          ...(move.promotion ? { promotion: move.promotion } : {}),
        } as MoveInput,
        san: move.san,
        color: move.color === 'w' ? 'white' : 'black',
        fenBefore: move.before,
        fenAfter: move.after,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `Invalid PGN: ${error.message}` : 'Invalid PGN.',
    };
  }
}

export function setupStateFromFen(fen: string): ExplorerSetupState {
  const chess = new Chess(fen);
  const pieces: ExplorerSetupState['pieces'] = {};
  for (const square of SQUARES) {
    const piece = chess.get(square);
    if (piece) pieces[square] = { color: piece.color, type: piece.type };
  }
  const fields = fen.split(' ');
  const castling = fields[2] ?? '-';
  return {
    pieces,
    turn: fields[1] === 'b' ? 'b' : 'w',
    castling: {
      whiteKing: castling.includes('K'),
      whiteQueen: castling.includes('Q'),
      blackKing: castling.includes('k'),
      blackQueen: castling.includes('q'),
    },
    enPassant: (fields[3] ?? '-') as '-' | Square,
  };
}

export function setupStateToFen(state: ExplorerSetupState): string {
  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let empty = 0;
    let row = '';
    for (const file of 'abcdefgh') {
      const piece = state.pieces[`${file}${rank}` as Square];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      const symbol = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
      row += symbol;
    }
    if (empty) row += String(empty);
    ranks.push(row);
  }
  const castling =
    `${state.castling.whiteKing ? 'K' : ''}${state.castling.whiteQueen ? 'Q' : ''}` +
    `${state.castling.blackKing ? 'k' : ''}${state.castling.blackQueen ? 'q' : ''}`;
  return `${ranks.join('/')} ${state.turn} ${castling || '-'} ${state.enPassant} 0 1`;
}

export function compatibleEnPassantSquares(turn: 'w' | 'b'): Array<'-' | Square> {
  const rank = turn === 'w' ? '6' : '3';
  return ['-', ...[...'abcdefgh'].map((file) => `${file}${rank}` as Square)];
}

function analyzablePositionError(fen: string): string | undefined {
  const chess = new Chess(fen);
  const whiteKing = findKing(chess, 'w');
  const blackKing = findKing(chess, 'b');
  if (!whiteKing || !blackKing) return 'The position needs one king of each color.';
  if (
    Math.abs(whiteKing.charCodeAt(0) - blackKing.charCodeAt(0)) <= 1 &&
    Math.abs(Number(whiteKing[1]) - Number(blackKing[1])) <= 1
  ) {
    return 'Kings cannot occupy adjacent squares.';
  }

  const fields = fen.split(' ');
  const castling = fields[2] ?? '-';
  const required: Array<[string, Square, Piece]> = [
    ['K', 'e1', { color: 'w', type: 'k' }],
    ['K', 'h1', { color: 'w', type: 'r' }],
    ['Q', 'e1', { color: 'w', type: 'k' }],
    ['Q', 'a1', { color: 'w', type: 'r' }],
    ['k', 'e8', { color: 'b', type: 'k' }],
    ['k', 'h8', { color: 'b', type: 'r' }],
    ['q', 'e8', { color: 'b', type: 'k' }],
    ['q', 'a8', { color: 'b', type: 'r' }],
  ];
  for (const [right, square, piece] of required) {
    const actual = chess.get(square);
    if (castling.includes(right) && (actual?.color !== piece.color || actual.type !== piece.type)) {
      return `Castling right ${right} does not match the king and rook placement.`;
    }
  }

  const enPassant = fields[3] as Square | '-';
  if (enPassant !== '-') {
    const file = enPassant[0];
    const pawnSquare = `${file}${fields[1] === 'w' ? '5' : '4'}` as Square;
    const pawn = chess.get(pawnSquare);
    const expectedColor = fields[1] === 'w' ? 'b' : 'w';
    if (chess.get(enPassant) || pawn?.type !== 'p' || pawn.color !== expectedColor) {
      return 'The en-passant target does not match a double-moved pawn.';
    }
  }

  const sideToMove = fields[1] as Color;
  const previousSide = sideToMove === 'w' ? 'b' : 'w';
  const previousKing = previousSide === 'w' ? whiteKing : blackKing;
  if (chess.isAttacked(previousKing, sideToMove)) {
    return 'The side that just moved cannot leave its own king in check.';
  }
  return undefined;
}

function findKing(chess: Chess, color: Color): Square | undefined {
  return SQUARES.find((square) => {
    const piece = chess.get(square);
    return piece?.color === color && piece.type === 'k';
  });
}

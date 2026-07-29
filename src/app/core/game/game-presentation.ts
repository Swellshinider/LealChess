import type { Move, PieceSymbol } from 'chess.js';
import type { ChessColor, GameResult, MoveRecord } from './game.types';
import { chessColor } from './chess-move';

export function moveRecords(history: readonly Move[]): MoveRecord[] {
  return history.map((move, index) => ({
    ply: index + 1,
    color: chessColor(move.color),
    from: move.from,
    to: move.to,
    san: move.san,
    lan: move.lan,
    piece: move.piece,
    ...(move.captured ? { captured: move.captured } : {}),
    ...(move.promotion ? { promotion: move.promotion } : {}),
    before: move.before,
    after: move.after,
  }));
}

export function describeMove(move: Move, inCheck: boolean): string {
  const pieceNames: Record<PieceSymbol, string> = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  };
  return `${capitalize(chessColor(move.color))} ${pieceNames[move.piece]} ${move.from} to ${move.to}${inCheck ? ', check' : ''}.`;
}

export function resultTag(result: GameResult): string {
  if (!result.winner) return '1/2-1/2';
  return result.winner === 'white' ? '1-0' : '0-1';
}

export function chooseChessColor(
  selection: ChessColor | 'random',
  randomValue = randomByte(),
): ChessColor {
  if (selection !== 'random') return selection;
  return randomValue % 2 === 0 ? 'white' : 'black';
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function randomByte(): number {
  const value = new Uint8Array(1);
  crypto.getRandomValues(value);
  return value[0] ?? 0;
}

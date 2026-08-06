import { Chess, type Color, type Square } from 'chess.js';
import type { AnalysisVariation, PositionAnalysisResult } from '../engine/analysis-engine.types';
import type { ChessColor } from '../../shared/chess/chess.types';
import type { MoveInput, PromotionPiece } from './game.types';

export interface ChessCandidateLine {
  rank: number;
  evaluation: AnalysisVariation['evaluation'];
  firstMove: MoveInput;
  san: string[];
}

export function parseUci(uci?: string): MoveInput | null {
  if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    ...(uci[4] ? { promotion: uci[4] as PromotionPiece } : {}),
  };
}

export function moveToUci(move: MoveInput): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

export function moveToSan(fen: string, move: MoveInput): string {
  const played = new Chess(fen).move(move);
  return played.san;
}

export function candidateLines(
  fen: string,
  result: PositionAnalysisResult,
  maximumPlies: number,
): ChessCandidateLine[] {
  const variations = result.variations?.length
    ? result.variations
    : [
        {
          rank: 1,
          evaluation: result.evaluation,
          principalVariation: result.principalVariation,
        },
      ];
  return variations
    .slice(0, 3)
    .map((variation) => candidateLine(fen, variation, maximumPlies))
    .filter((line): line is ChessCandidateLine => line !== null);
}

export function legalDestinations(position: Chess | string, enabled = true): Map<Square, Square[]> {
  const destinations = new Map<Square, Square[]>();
  if (!enabled) return destinations;
  const chess = typeof position === 'string' ? new Chess(position) : position;
  for (const move of chess.moves({ verbose: true })) {
    const existing = destinations.get(move.from) ?? [];
    if (!existing.includes(move.to)) existing.push(move.to);
    destinations.set(move.from, existing);
  }
  return destinations;
}

export function chessColor(color: Color): ChessColor {
  return color === 'w' ? 'white' : 'black';
}

export function oppositeChessColor(color: ChessColor): ChessColor {
  return color === 'white' ? 'black' : 'white';
}

export function turnColor(fen: string): ChessColor {
  return chessColor(new Chess(fen).turn());
}

function candidateLine(
  fen: string,
  variation: AnalysisVariation,
  maximumPlies: number,
): ChessCandidateLine | null {
  const firstMove = parseUci(variation.principalVariation[0]);
  if (!firstMove) return null;
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of variation.principalVariation.slice(0, maximumPlies)) {
    const move = parseUci(uci);
    if (!move) break;
    try {
      san.push(chess.move(move).san);
    } catch {
      break;
    }
  }
  return {
    rank: variation.rank,
    evaluation: variation.evaluation,
    firstMove,
    san,
  };
}

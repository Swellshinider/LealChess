import type { ChessColor } from './chess.types';

export function boardOverlayPosition(square: string, orientation: ChessColor): string {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const displayFile = orientation === 'white' ? file : 7 - file;
  const displayRank = orientation === 'white' ? 7 - rank : rank;
  const alignFromLeft = displayFile === 0;
  const left = alignFromLeft ? 0.75 : (displayFile + 1) * 12.5 - 0.75;
  const top = (displayRank + 1) * 12.5 - 0.75;
  const transform = alignFromLeft ? 'translate(0, -100%)' : 'translate(-100%, -100%)';
  return `left: ${left}%; top: ${top}%; transform: ${transform}`;
}

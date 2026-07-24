import type { MoveInput, PromotionPiece } from '../game/game.types';

const BEST_MOVE_PATTERN = /^bestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?(?:\s|$)/;

export function parseBestMove(line: string): MoveInput | null | undefined {
  const normalized = line.trim();
  if (normalized === 'bestmove (none)' || normalized.startsWith('bestmove 0000')) {
    return null;
  }

  const match = BEST_MOVE_PATTERN.exec(normalized);
  if (!match) {
    return normalized.startsWith('bestmove') ? null : undefined;
  }

  const [, from, to, promotion] = match;
  return {
    from: from as MoveInput['from'],
    to: to as MoveInput['to'],
    ...(promotion ? { promotion: promotion as PromotionPiece } : {}),
  };
}

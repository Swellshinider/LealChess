import type { SoundEvent } from '../../../core/sound/sound.service';
import type { ImportedMove } from '../domain/coach.types';

export function reviewSoundEvents(move: ImportedMove): SoundEvent[] {
  const primary: SoundEvent = move.san.startsWith('O-O')
    ? 'castle'
    : move.san.includes('=')
      ? 'promotion'
      : move.san.includes('x')
        ? 'capture'
        : 'move';
  return /[+#]$/.test(move.san) ? [primary, 'check'] : [primary];
}
